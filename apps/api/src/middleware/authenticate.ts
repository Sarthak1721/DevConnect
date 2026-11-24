import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import {
  type AccessTokenClaims,
  AccessTokenError,
  verifyAccessToken,
} from '../modules/auth/tokens';

/**
 * Protects a route: requires `Authorization: Bearer <access token>` and puts the caller's identity
 * on req.auth. Answers 401 otherwise, with the WWW-Authenticate header that RFC 6750 defines for
 * bearer tokens.
 *
 *   no token                 → 401 UNAUTHENTICATED   (sign in)
 *   expired token            → 401 TOKEN_EXPIRED     (the web app refreshes and retries)
 *   any other invalid token  → 401 UNAUTHENTICATED   (bad signature, wrong issuer, alg "none", ...)
 *
 * No database query: the signature proves the API issued the token, and `exp` that it's recent.
 * The price: logging out can't cancel an access token already issued; it simply expires within
 * JWT_ACCESS_TTL_SECONDS (15 minutes).
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.get('authorization');
  if (!header) {
    throw unauthorized(
      'UNAUTHENTICATED',
      'Please sign in to continue.',
      'Bearer realm="devconnect"',
    );
  }

  const [scheme, token, ...extra] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || extra.length > 0) {
    throw invalidToken('UNAUTHENTICATED', 'The Authorization header must be "Bearer <token>".');
  }

  try {
    req.auth = await verifyAccessToken(token);
  } catch (error) {
    const expired = error instanceof AccessTokenError && error.reason === 'expired';
    throw expired
      ? invalidToken(
          'TOKEN_EXPIRED',
          'Your session token expired. Refresh it and try again.',
          error,
        )
      : invalidToken(
          'UNAUTHENTICATED',
          'Your session token is not valid. Please sign in again.',
          error,
        );
  }
  next();
};

function unauthorized(
  code: 'UNAUTHENTICATED' | 'TOKEN_EXPIRED',
  message: string,
  challenge: string,
  cause?: unknown,
) {
  return new AppError(401, code, message, { cause, headers: { 'WWW-Authenticate': challenge } });
}

function invalidToken(code: 'UNAUTHENTICATED' | 'TOKEN_EXPIRED', message: string, cause?: unknown) {
  const description =
    code === 'TOKEN_EXPIRED' ? 'The access token expired' : 'Invalid access token';
  return unauthorized(
    code,
    message,
    `Bearer realm="devconnect", error="invalid_token", error_description="${description}"`,
    cause,
  );
}

/**
 * The caller's identity inside a route protected by `authenticate`. Throws (a 500: it's a bug)
 * if the route forgot the middleware, rather than silently treating the request as anonymous.
 */
export function authOf(req: Request): AccessTokenClaims {
  if (!req.auth) throw new Error('authOf() used on a route without the authenticate middleware');
  return req.auth;
}
