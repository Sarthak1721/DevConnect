import { createHash, randomBytes } from 'node:crypto';
import { errors, jwtVerify, SignJWT } from 'jose';
import { env } from '../../config/env';

/*
 * ACCESS TOKENS: short-lived JWTs (docs/adr/0006, 0011).
 *
 * A JWT is three base64url parts: header.payload.signature. Anyone can READ the payload (it is
 * encoded, not encrypted), so it holds ids only, never personal data. Only the API can PRODUCE a
 * valid signature: HMAC-SHA256 over header.payload with JWT_ACCESS_SECRET. Checking a token costs
 * one HMAC and no database query, which is the point of using a JWT for every request.
 */

const ISSUER = 'devconnect-api';
const AUDIENCE = 'devconnect-web';
/**
 * Explicit token type (RFC 8725 §3.11, value from RFC 9068). If we ever sign other JWTs with
 * this key (say, email-verification links), they can't be passed off as access tokens.
 */
const TOKEN_TYPE = 'at+jwt';

const signingKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export type AccessTokenClaims = {
  /** `sub`: who the token is for. */
  userId: string;
  /** `sid`: the login session (refresh-token family) it was issued under. */
  sessionId: string;
};

export async function signAccessToken({ userId, sessionId }: AccessTokenClaims): Promise<string> {
  return new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: 'HS256', typ: TOKEN_TYPE })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.JWT_ACCESS_TTL_SECONDS}s`) // "900s" means 900 seconds from now
    .sign(signingKey);
}

/** Why a token was refused: an expired token is worth refreshing, an invalid one is not. */
export class AccessTokenError extends Error {
  readonly reason: 'expired' | 'invalid';

  constructor(reason: 'expired' | 'invalid', options?: { cause?: unknown }) {
    super(`Access token ${reason}`, options);
    this.name = 'AccessTokenError';
    this.reason = reason;
  }
}

/**
 * Verifies signature, expiry, issuer, audience and type. `algorithms` is the important line:
 * the token's own header says which algorithm signed it, and a verifier that believes it can be
 * fooled ("alg": "none" means "no signature"). We accept HS256 and nothing else.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, signingKey, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
      typ: TOKEN_TYPE,
      requiredClaims: ['sub', 'sid', 'iat', 'exp'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') {
      throw new AccessTokenError('invalid');
    }
    return { userId: payload.sub, sessionId: payload.sid };
  } catch (error) {
    if (error instanceof AccessTokenError) throw error;
    throw new AccessTokenError(error instanceof errors.JWTExpired ? 'expired' : 'invalid', {
      cause: error,
    });
  }
}

/*
 * REFRESH TOKENS: long-lived, opaque, single-use (docs/adr/0011).
 *
 * Just 32 random bytes; it means nothing by itself, the database row is what gives it meaning.
 * We store only its SHA-256. A fast hash is fine here, unlike for passwords: guessing a 256-bit
 * random value succeeds with probability 2⁻²⁵⁶ per try, so there's nothing to slow down.
 */

/** 32 bytes = 256 bits of randomness, as 43 URL- and cookie-safe characters. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What the database stores: 64 hex characters (matches the refresh_tokens CHECK constraint). */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Rejects junk before it reaches the database: exactly the shape generateRefreshToken() makes. */
export function isWellFormedRefreshToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
