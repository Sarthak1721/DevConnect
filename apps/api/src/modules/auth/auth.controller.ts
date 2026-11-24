import {
  type ApiSuccess,
  type AuthSession,
  type CurrentUser,
  loginRequestSchema,
  registerRequestSchema,
} from '@devconnect/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../lib/errors';
import { emailKey, enforceRateLimits, ipKey, RATE_LIMITS } from '../../lib/rate-limit';
import { authOf } from '../../middleware/authenticate';
import * as authService from './auth.service';
import { clearSessionCookies, readRefreshCookie, setSessionCookies } from './refresh-cookie';

/**
 * The HTTP side of auth: read and validate the request, call the service, shape the response,
 * set or clear the cookie, and log security events. Express 5 forwards a thrown error (or a
 * rejected promise) to the error handler, so there are no try/catch blocks here.
 *
 * Security events are logged with ids only: never emails, passwords, tokens or IP addresses.
 */

/** Stored with each session, for a future "where am I signed in?" page. */
function userAgentOf(req: Request): string | null {
  return req.get('user-agent')?.slice(0, 512) ?? null;
}

/** Cookie for the browser, access token and user for the app. The refresh token is never in the body. */
function sendSession(res: Response, status: number, session: authService.IssuedSession): void {
  setSessionCookies(res, session.refreshToken, session.refreshTokenExpiresAt);
  const body: ApiSuccess<AuthSession> = {
    success: true,
    data: { user: session.user, accessToken: session.accessToken, expiresIn: session.expiresIn },
  };
  res.status(status).json(body);
}

function sessionEnded(): AppError {
  return new AppError(401, 'UNAUTHENTICATED', 'Your session has ended. Please sign in again.');
}

/** POST /api/v1/auth/register */
export async function register(req: Request, res: Response): Promise<void> {
  const input = registerRequestSchema.parse(req.body);
  await enforceRateLimits([{ rule: RATE_LIMITS.registerPerIp, key: ipKey(req) }]);

  const session = await authService.register(input, userAgentOf(req));

  req.log.info({ event: 'auth.registered', userId: session.user.id }, 'New account registered');
  sendSession(res, 201, session);
}

/** POST /api/v1/auth/login */
export async function login(req: Request, res: Response): Promise<void> {
  const input = loginRequestSchema.parse(req.body);
  await enforceRateLimits([
    { rule: RATE_LIMITS.loginPerIp, key: ipKey(req) },
    { rule: RATE_LIMITS.loginPerAccount, key: emailKey(input.email) },
  ]);

  const result = await authService.login(input, userAgentOf(req));

  if (!result.ok) {
    req.log.warn(
      {
        event: 'auth.login_failed',
        reason: result.reason,
        ...(result.reason === 'wrong_password' && { userId: result.userId }),
      },
      'Login failed',
    );
    // One answer for both failures: telling them apart would reveal which emails have accounts.
    throw new AppError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
  }

  req.log.info({ event: 'auth.logged_in', userId: result.session.user.id }, 'Logged in');
  sendSession(res, 200, result.session);
}

/** POST /api/v1/auth/refresh (credential: the dc_rt cookie) */
export async function refresh(req: Request, res: Response): Promise<void> {
  const presented = readRefreshCookie(req);
  if (presented === undefined) {
    clearSessionCookies(res); // a leftover hint cookie would make the app keep asking
    throw sessionEnded();
  }

  const result = await authService.refresh(presented, userAgentOf(req));

  if (result.ok) {
    if (result.viaGracePeriod) {
      req.log.info(
        { event: 'auth.refresh_grace', userId: result.session.user.id },
        'Token refreshed twice within the grace period (concurrent tabs or a retried request)',
      );
    }
    sendSession(res, 200, result.session);
    return;
  }

  if (result.reason === 'reused') {
    // Possible token theft: worth an alert once alerting exists (Phase 17).
    req.log.warn(
      { event: 'auth.refresh_token_reused', userId: result.userId, sessionId: result.sessionId },
      'Refresh token reuse detected: the whole session was revoked',
    );
  }
  // The cookie is useless now: delete it, so the browser stops sending it.
  clearSessionCookies(res);
  throw sessionEnded();
}

/** POST /api/v1/auth/logout (credential: the dc_rt cookie). Always succeeds. */
export async function logout(req: Request, res: Response): Promise<void> {
  const presented = readRefreshCookie(req);
  if (presented !== undefined) await authService.logout(presented);

  clearSessionCookies(res);
  res.status(204).end();
}

/** POST /api/v1/auth/logout-all (credential: access token). Signs out every device. */
export async function logoutAll(req: Request, res: Response): Promise<void> {
  const { userId } = authOf(req);
  const revoked = await authService.logoutEverywhere(userId);

  req.log.info({ event: 'auth.logged_out_everywhere', userId, revoked }, 'Logged out everywhere');
  clearSessionCookies(res);
  res.status(204).end();
}

/** GET /api/v1/auth/me (credential: access token) */
export async function me(req: Request, res: Response): Promise<void> {
  const user = await authService.getCurrentUser(authOf(req).userId);
  // A valid token for a user who no longer exists (deleted within the last 15 minutes).
  if (!user) throw sessionEnded();

  const body: ApiSuccess<CurrentUser> = { success: true, data: { user } };
  res.json(body);
}
