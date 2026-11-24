import type { AuthUser, LoginRequest, RegisterRequest } from '@devconnect/shared';
import { env } from '../../config/env';
import { db, type Executor } from '../../db/client';
import { AppError } from '../../lib/errors';
import { isPgError, PG_ERROR_CODES } from '../../lib/pg-errors';
import * as repo from './auth.repository';
import { hashPassword, needsUpgrade, verifyAgainstDummyHash, verifyPassword } from './password';
import {
  generateRefreshToken,
  hashRefreshToken,
  isWellFormedRefreshToken,
  signAccessToken,
} from './tokens';

/**
 * The auth use cases, free of HTTP: no req, no res, no cookies. The controller translates
 * between HTTP and these functions, which keeps them easy to read and to test.
 */

/** Everything a successful register, login or refresh produces. */
export type IssuedSession = {
  user: AuthUser;
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  /** Raw refresh token: goes into the cookie, and nowhere else. */
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

/** Starts a login session: a new refresh-token family plus an access token tied to it. */
async function startSession(
  executor: Executor,
  user: AuthUser,
  userAgent: string | null,
): Promise<IssuedSession> {
  const refreshToken = generateRefreshToken();
  await repo.deleteExpiredFamilies(executor, user.id);
  const issued = await repo.startFamily(executor, {
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    userAgent,
  });
  return {
    user,
    accessToken: await signAccessToken({ userId: user.id, sessionId: issued.familyId }),
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    refreshToken,
    refreshTokenExpiresAt: issued.expiresAt,
  };
}

// ---------------------------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------------------------

export async function register(
  input: RegisterRequest,
  userAgent: string | null,
): Promise<IssuedSession> {
  // Hash before opening the transaction: no point holding a database connection for ~30 ms
  // of pure CPU work.
  const passwordHash = await hashPassword(input.password);

  try {
    // All or nothing: user, profile and first session are created together, or not at all.
    return await db.transaction(async (tx) => {
      const user = await repo.insertUserWithProfile(tx, {
        name: input.name,
        username: input.username,
        email: input.email,
        passwordHash,
      });
      return startSession(tx, user, userAgent);
    });
  } catch (error) {
    // No "SELECT first, then INSERT" check: two people registering the same name at the same time
    // would both pass it. The UNIQUE index decides, atomically; we translate its verdict.
    if (isPgError(error, PG_ERROR_CODES.UNIQUE_VIOLATION, 'users_email_key')) {
      throw conflict('EMAIL_TAKEN', 'email', 'An account with this email already exists.');
    }
    if (isPgError(error, PG_ERROR_CODES.UNIQUE_VIOLATION, 'users_username_key')) {
      throw conflict('USERNAME_TAKEN', 'username', 'This username is already taken.');
    }
    throw error;
  }
}

function conflict(code: 'EMAIL_TAKEN' | 'USERNAME_TAKEN', field: string, message: string) {
  // Same details shape as a validation error, so the form can show it next to the field.
  return new AppError(409, code, message, { details: [{ path: field, message }] });
}

// ---------------------------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------------------------

export type LoginResult =
  | { ok: true; session: IssuedSession }
  | { ok: false; reason: 'unknown_email' }
  | { ok: false; reason: 'wrong_password'; userId: string };

export async function login(input: LoginRequest, userAgent: string | null): Promise<LoginResult> {
  const user = await repo.findUserByEmail(input.email);

  if (!user) {
    // Same work, same time, same answer as a wrong password (see verifyAgainstDummyHash).
    await verifyAgainstDummyHash(input.password);
    return { ok: false, reason: 'unknown_email' };
  }

  const { passwordHash, ...publicUser } = user;
  if (!(await verifyPassword(passwordHash, input.password))) {
    return { ok: false, reason: 'wrong_password', userId: user.id };
  }

  // The only moment we have the plain password: if the hash uses old parameters, upgrade it now.
  if (needsUpgrade(passwordHash)) {
    await repo.updatePasswordHash(user.id, await hashPassword(input.password));
  }

  return { ok: true, session: await startSession(db, publicUser, userAgent) };
}

// ---------------------------------------------------------------------------------------------
// Refresh: rotation with reuse detection (docs/adr/0011)
// ---------------------------------------------------------------------------------------------

export type RefreshResult =
  | { ok: true; session: IssuedSession; viaGracePeriod: boolean }
  | { ok: false; reason: 'malformed' | 'unknown' | 'expired' | 'revoked' }
  | { ok: false; reason: 'reused'; userId: string; sessionId: string };

/**
 * Trades a refresh token for a new one (plus a new access token). Decision table, for a token
 * that can't simply be claimed:
 *
 *   not in the database                     → refuse
 *   its family is revoked                   → refuse
 *   not rotated (so: expired)               → refuse
 *   its family is past the 30-day cap       → refuse
 *   rotated < 10 s ago                      → two tabs refreshed at once: issue a sibling token
 *   rotated earlier, family still alive     → REUSE: someone replayed an old token. Revoke the
 *                                             family; whoever holds its newest token (the real
 *                                             user or the thief) is logged out too.
 */
export async function refresh(
  presentedToken: string,
  userAgent: string | null,
): Promise<RefreshResult> {
  if (!isWellFormedRefreshToken(presentedToken)) return { ok: false, reason: 'malformed' };

  const tokenHash = hashRefreshToken(presentedToken);
  const nextToken = generateRefreshToken();
  const next = { tokenHash: hashRefreshToken(nextToken), userAgent };

  const outcome = await db.transaction(async (tx) => {
    const claimed = await repo.claimToken(tx, tokenHash);
    if (claimed) {
      const successor = await repo.issueInFamilyOf(tx, claimed.id, next);
      // Only possible if the family was revoked between the two statements (a concurrent logout).
      if (!successor) return { ok: false, reason: 'revoked' } as const;
      await repo.recordSuccessor(tx, claimed.id, successor.id);
      return {
        ok: true,
        issued: successor,
        userId: claimed.userId,
        viaGracePeriod: false,
      } as const;
    }

    const state = await repo.findTokenState(tx, tokenHash);
    if (!state) return { ok: false, reason: 'unknown' } as const;
    if (state.familyRevoked) return { ok: false, reason: 'revoked' } as const;
    if (!state.rotated || state.familyExpired) return { ok: false, reason: 'expired' } as const;

    if (state.withinGrace) {
      const sibling = await repo.issueInFamilyOf(tx, state.id, next);
      if (!sibling) return { ok: false, reason: 'expired' } as const;
      return { ok: true, issued: sibling, userId: state.userId, viaGracePeriod: true } as const;
    }

    await repo.revokeFamily(tx, state.familyId);
    return {
      ok: false,
      reason: 'reused',
      userId: state.userId,
      sessionId: state.familyId,
    } as const;
  });

  if (!outcome.ok) return outcome;

  const user = await repo.findUserById(outcome.userId);
  // Deleting a user deletes their tokens (ON DELETE CASCADE), so this is a can't-happen guard.
  if (!user) return { ok: false, reason: 'unknown' };

  return {
    ok: true,
    viaGracePeriod: outcome.viaGracePeriod,
    session: {
      user,
      accessToken: await signAccessToken({ userId: user.id, sessionId: outcome.issued.familyId }),
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
      refreshToken: nextToken,
      refreshTokenExpiresAt: outcome.issued.expiresAt,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Logout, current user
// ---------------------------------------------------------------------------------------------

/** Ends the session the token belongs to. Idempotent: an unknown or malformed token is a no-op. */
export async function logout(presentedToken: string): Promise<void> {
  if (!isWellFormedRefreshToken(presentedToken)) return;
  await repo.revokeFamilyOfToken(db, hashRefreshToken(presentedToken));
}

/** Ends every session of the user, on every device. Returns how many tokens were revoked. */
export async function logoutEverywhere(userId: string): Promise<number> {
  return repo.revokeAllForUser(db, userId);
}

export async function getCurrentUser(userId: string): Promise<AuthUser | undefined> {
  return repo.findUserById(userId);
}
