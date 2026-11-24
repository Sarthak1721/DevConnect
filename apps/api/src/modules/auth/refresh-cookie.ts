import { SESSION_HINT_COOKIE_NAME } from '@devconnect/shared';
import type { CookieOptions, Request, Response } from 'express';

/**
 * The refresh token's only home in the browser. Each attribute closes a door:
 *
 *   HttpOnly           JavaScript can't read it, so an XSS bug can't steal it
 *   Secure             sent over HTTPS only (browsers treat http://localhost as secure too)
 *   SameSite=Strict    never attached to a request that starts on another site (CSRF)
 *   Path=/api/v1/auth  sent only to the auth endpoints, not with every page or API call
 *
 * No Domain attribute: the cookie belongs to exactly the host the browser talked to (the web
 * app's own origin, thanks to the /api proxy), not to its subdomains.
 */
export const REFRESH_COOKIE_NAME = 'dc_rt';

const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/api/v1/auth',
};

/**
 * A companion cookie that only says "a refresh cookie exists", which the web app CAN read
 * (no HttpOnly). On page load it lets the app skip the refresh call for visitors who aren't
 * signed in, instead of sending a request that can only fail with 401. It holds no secret:
 * reading or forging it gains nothing, the server never looks at it. (Its name,
 * SESSION_HINT_COOKIE_NAME, lives in @devconnect/shared: both sides must agree on it.)
 */
const SESSION_HINT_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: false,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

/** Max-Age (relative) rather than Expires (a date), so a wrong client clock doesn't matter. */
export function setSessionCookies(res: Response, refreshToken: string, expiresAt: Date): void {
  const maxAge = Math.max(0, expiresAt.getTime() - Date.now()); // Express takes milliseconds
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, { ...REFRESH_COOKIE_OPTIONS, maxAge });
  res.cookie(SESSION_HINT_COOKIE_NAME, '1', { ...SESSION_HINT_COOKIE_OPTIONS, maxAge });
}

/** Tells the browser to delete both cookies (same name, path and flags; already expired). */
export function clearSessionCookies(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
  res.clearCookie(SESSION_HINT_COOKIE_NAME, SESSION_HINT_COOKIE_OPTIONS);
}

export function readRefreshCookie(req: Request): string | undefined {
  // Parsed by cookie-parser (mounted on the auth router only).
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' ? value : undefined;
}
