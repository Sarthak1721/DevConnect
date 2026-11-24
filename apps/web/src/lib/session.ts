import {
  apiSuccessSchema,
  type AuthSession,
  authSessionSchema,
  type AuthUser,
  SESSION_HINT_COOKIE_NAME,
} from '@devconnect/shared';

/**
 * The browser side of the session (docs/adr/0006, 0011): a tiny store outside React.
 *
 * The ACCESS TOKEN lives in a module variable: in memory only. Not in localStorage, where any
 * script injected through an XSS bug could read it and use it from anywhere; not in a cookie,
 * where the browser would attach it to requests by itself (CSRF). Reloading the page loses it,
 * which is fine: the REFRESH TOKEN, in its HttpOnly cookie, gets a new one (restoreSession).
 *
 * Only the browser ever changes this module's state: login, refresh and logout happen in event
 * handlers and effects, which don't run during server rendering. On the server every visitor is
 * "loading" (getServerSnapshot), so one visitor's session can never leak into another's page.
 */

export type SessionState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: AuthUser };

const LOADING: SessionState = { status: 'loading' };
const ANONYMOUS: SessionState = { status: 'anonymous' };

let state: SessionState = LOADING;
let accessToken: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function setState(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

// ---- The store interface React's useSyncExternalStore expects (see hooks/use-session.ts) ----

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getSnapshot = (): SessionState => state;

export const getServerSnapshot = (): SessionState => LOADING;

// ---- Token handling ---------------------------------------------------------------------------

export function getAccessToken(): string | null {
  return accessToken;
}

/** After login, registration or a refresh: keep the token, and plan the next refresh. */
export function startSession(session: AuthSession): void {
  accessToken = session.accessToken;
  // Refresh a minute before the token expires, so requests rarely meet an expired token. (If the
  // computer sleeps through that moment, refresh-on-401 in api-client.ts catches up.)
  clearTimeout(refreshTimer);
  const delaySeconds = Math.max(session.expiresIn - 60, session.expiresIn / 2);
  refreshTimer = setTimeout(() => {
    refreshSession().catch(() => {
      // Network trouble: the next API call will retry through refresh-on-401.
    });
  }, delaySeconds * 1000);
  setState({ status: 'authenticated', user: session.user });
}

export function endSession(): void {
  accessToken = null;
  clearTimeout(refreshTimer);
  setState(ANONYMOUS);
}

// ---- Refresh ----------------------------------------------------------------------------------

let refreshInFlight: Promise<AuthSession | null> | null = null;

/**
 * Trades the refresh cookie for a new session; resolves to null if there is no valid session.
 *
 * One refresh at a time:
 *  - within a tab, callers share the request in flight (ten 401s → one refresh);
 *  - across tabs, the Web Locks API queues them. All tabs share one cookie, and each refresh
 *    replaces it, so a second tab must wait for the first one's new cookie instead of racing
 *    it with the old one (which the server would take for a replayed, stolen token).
 */
export function refreshSession(): Promise<AuthSession | null> {
  refreshInFlight ??= withRefreshLock(callRefreshEndpoint).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  // Older browsers without Web Locks still work: the server's 10-second grace period covers them.
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return task();
  return navigator.locks.request('devconnect:refresh', task);
}

async function callRefreshEndpoint(): Promise<AuthSession | null> {
  // The browser attaches the dc_rt cookie by itself; JavaScript never sees it.
  const response = await fetch('/api/v1/auth/refresh', { method: 'POST', cache: 'no-store' });
  if (response.status === 401) {
    endSession();
    return null;
  }
  if (!response.ok) throw new Error(`Refreshing the session failed (HTTP ${response.status})`);

  const session = apiSuccessSchema(authSessionSchema).parse(await response.json()).data;
  startSession(session);
  return session;
}

/**
 * On page load: the access token died with the previous page, but the refresh cookie may still
 * be valid. Ends in "authenticated" or "anonymous", never stuck in "loading".
 */
export async function restoreSession(): Promise<void> {
  // The refresh cookie is invisible to JavaScript (HttpOnly), but its companion hint cookie isn't.
  // No hint means no refresh cookie: a visitor who isn't signed in costs no request at all.
  if (!document.cookie.split('; ').includes(`${SESSION_HINT_COOKIE_NAME}=1`)) {
    endSession();
    return;
  }
  try {
    await refreshSession();
  } catch {
    // API unreachable: treat as signed out for now; a later action will retry.
    endSession();
  }
}
