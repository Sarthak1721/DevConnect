import { authSessionSchema, type LoginRequest, type RegisterRequest } from '@devconnect/shared';
import { apiFetch } from './api-client';
import { endSession, startSession } from './session';

/**
 * The auth actions the UI calls. Each one talks to the API, then updates the session store,
 * which re-renders every component that reads it (useSession).
 */

export async function login(credentials: LoginRequest): Promise<void> {
  startSession(
    await apiFetch('/auth/login', { method: 'POST', body: credentials, schema: authSessionSchema }),
  );
}

export async function register(account: RegisterRequest): Promise<void> {
  startSession(
    await apiFetch('/auth/register', { method: 'POST', body: account, schema: authSessionSchema }),
  );
}

/** Ends this browser's session. Signed out locally even if the network call fails. */
export async function logout(): Promise<void> {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } finally {
    endSession();
  }
}

/** Ends every session of the account, on every device. */
export async function logoutEverywhere(): Promise<void> {
  await apiFetch('/auth/logout-all', { method: 'POST', auth: true });
  endSession();
}

/**
 * Where to go after signing in, from ?next=... in the URL. Anyone can craft that URL, so only a
 * page of this site is accepted; anything else falls back to the feed. Otherwise a link like
 * /login?next=https://evil.example would turn our login page into a launcher for phishing sites
 * (an "open redirect"), and next=javascript:... would even run code.
 *
 * Rather than spotting bad strings ("//evil.example", "/\evil.example", "/\t/evil.example" all
 * leave the site), let the browser's URL parser resolve it, then compare origins.
 */
export function safeNextPath(search: string, origin: string): string {
  const next = new URLSearchParams(search).get('next');
  if (next === null) return '/feed';
  try {
    const target = new URL(next, origin);
    if (target.origin !== origin) return '/feed';
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return '/feed'; // not even a URL
  }
}
