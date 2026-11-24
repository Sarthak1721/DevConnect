import type { AuthUser } from '@devconnect/shared';
import { eq, sql } from 'drizzle-orm';
import { env } from '../../config/env';
import { db, type Executor, type Transaction } from '../../db/client';
import { profiles, users } from '../../db/schema';

/**
 * Every SQL statement the auth module runs. The service decides WHAT should happen; this file
 * only knows HOW to say it to Postgres.
 *
 * Users go through Drizzle's query builder. The refresh-token statements are written as SQL
 * (still through Drizzle's `sql` tag, so every ${value} is sent as a bound parameter, never
 * pasted into the text): they're the heart of the session security, and reading them as SQL is
 * the easiest way to check them.
 */

// ---------------------------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------------------------

/** The columns a client may see about the signed-in user (never password_hash). */
const authUserColumns = {
  id: users.id,
  username: users.username,
  name: users.name,
  email: users.email,
  avatarUrl: users.avatarUrl,
};

export type NewUser = { name: string; username: string; email: string; passwordHash: string };

/** Registration creates the user and their (empty) profile together, inside the caller's transaction. */
export async function insertUserWithProfile(tx: Transaction, newUser: NewUser): Promise<AuthUser> {
  const [user] = await tx.insert(users).values(newUser).returning(authUserColumns);
  if (!user) throw new Error('INSERT ... RETURNING returned no row');
  await tx.insert(profiles).values({ userId: user.id });
  return user;
}

export async function findUserByEmail(
  email: string,
): Promise<(AuthUser & { passwordHash: string }) | undefined> {
  const [user] = await db
    .select({ ...authUserColumns, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email));
  return user;
}

export async function findUserById(id: string): Promise<AuthUser | undefined> {
  const [user] = await db.select(authUserColumns).from(users).where(eq(users.id, id));
  return user;
}

export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

// ---------------------------------------------------------------------------------------------
// Refresh tokens (docs/adr/0011)
//
// A login starts a FAMILY of tokens. Each refresh marks the presented token as rotated and adds
// its successor to the same family. Revocation is a property of the whole family: as soon as one
// of its tokens carries a revoked_at, no token in it works. Why not just check the token's own
// row? Because of a race: an UPDATE that revokes "every token in the family" can't see a successor
// that a concurrent refresh inserts at the same moment (it isn't committed yet), so that successor
// would escape the revocation. Checking the family at the moment a token is USED closes the gap.
// ---------------------------------------------------------------------------------------------

/** A login session lasts at most this long, however often it's refreshed. */
export const SESSION_MAX_DAYS = 30;

/** Two refreshes with the same token within this window are treated as a race, not a theft. */
export const REUSE_GRACE_SECONDS = 10;

/** True when any token in the family of `t` has been revoked (uses refresh_tokens_revoked_family_idx). */
const familyRevoked = sql`exists (
  select 1 from refresh_tokens as r
  where r.family_id = t.family_id and r.revoked_at is not null
)`;

export type IssuedRefreshToken = { id: string; familyId: string; expiresAt: Date };

// Raw SQL results arrive as the driver hands them over: Drizzle tells node-postgres to leave
// timestamps as text ("2026-11-24 06:08:58.038+00") and converts them only for columns it selected
// itself. So we convert here, exactly as Drizzle's timestamptz column does: new Date(text).
type IssuedRow = { id: string; family_id: string; expires_at: string };

const toIssued = (row: IssuedRow): IssuedRefreshToken => ({
  id: row.id,
  familyId: row.family_id,
  expiresAt: new Date(row.expires_at),
});

/** Login or registration: the first token of a new family. All times come from the database clock. */
export async function startFamily(
  executor: Executor,
  token: { userId: string; tokenHash: string; userAgent: string | null },
): Promise<IssuedRefreshToken> {
  const { rows } = await executor.execute<IssuedRow>(sql`
    insert into refresh_tokens
      (user_id, family_id, token_hash, expires_at, family_expires_at, user_agent)
    values (
      ${token.userId}, uuidv7(), ${token.tokenHash},
      now() + make_interval(days => ${env.REFRESH_TOKEN_TTL_DAYS}),
      now() + make_interval(days => ${SESSION_MAX_DAYS}),
      ${token.userAgent}
    )
    returning id, family_id, expires_at
  `);
  const [row] = rows;
  if (!row) throw new Error('INSERT ... RETURNING returned no row');
  return toIssued(row);
}

/**
 * Atomically "uses up" a token: succeeds for exactly one caller, however many present the same
 * token at once. Concurrent callers wait for the first one's row lock; when it commits, Postgres
 * re-checks their WHERE clause, finds rotated_at set, and updates nothing for them.
 */
export async function claimToken(
  tx: Transaction,
  tokenHash: string,
): Promise<{ id: string; userId: string; familyId: string } | undefined> {
  const { rows } = await tx.execute<{ id: string; user_id: string; family_id: string }>(sql`
    update refresh_tokens as t
       set rotated_at = now()
     where t.token_hash = ${tokenHash}
       and t.rotated_at is null
       and t.expires_at > now()
       and not ${familyRevoked}
    returning t.id, t.user_id, t.family_id
  `);
  const [row] = rows;
  return row && { id: row.id, userId: row.user_id, familyId: row.family_id };
}

/**
 * Adds a token to the family of an existing token: the successor after a rotation, or a sibling
 * during the grace period. Each refresh restarts the inactivity clock (REFRESH_TOKEN_TTL_DAYS),
 * but never past the family's own deadline. Inserts nothing if the family has expired or been
 * revoked in the meantime.
 */
export async function issueInFamilyOf(
  tx: Transaction,
  tokenId: string,
  token: { tokenHash: string; userAgent: string | null },
): Promise<IssuedRefreshToken | undefined> {
  const { rows } = await tx.execute<IssuedRow>(sql`
    insert into refresh_tokens
      (user_id, family_id, token_hash, expires_at, family_expires_at, user_agent)
    select t.user_id, t.family_id, ${token.tokenHash},
           least(now() + make_interval(days => ${env.REFRESH_TOKEN_TTL_DAYS}), t.family_expires_at),
           t.family_expires_at, ${token.userAgent}
      from refresh_tokens as t
     where t.id = ${tokenId}
       and t.family_expires_at > now()
       and not ${familyRevoked}
    returning id, family_id, expires_at
  `);
  const [row] = rows;
  return row && toIssued(row);
}

/** Records which token replaced which, so a session's chain can be audited later. */
export async function recordSuccessor(
  tx: Transaction,
  tokenId: string,
  successorId: string,
): Promise<void> {
  await tx.execute(
    sql`update refresh_tokens set replaced_by = ${successorId} where id = ${tokenId}`,
  );
}

export type TokenState = {
  id: string;
  userId: string;
  familyId: string;
  rotated: boolean;
  /** Rotated less than REUSE_GRACE_SECONDS ago. */
  withinGrace: boolean;
  familyExpired: boolean;
  familyRevoked: boolean;
};

/** Why couldn't a token be claimed? Called only after claimToken() returned nothing. */
export async function findTokenState(
  tx: Transaction,
  tokenHash: string,
): Promise<TokenState | undefined> {
  const { rows } = await tx.execute<{
    id: string;
    user_id: string;
    family_id: string;
    rotated: boolean;
    within_grace: boolean;
    family_expired: boolean;
    family_revoked: boolean;
  }>(sql`
    select t.id, t.user_id, t.family_id,
           t.rotated_at is not null as rotated,
           coalesce(t.rotated_at > now() - make_interval(secs => ${REUSE_GRACE_SECONDS}), false)
             as within_grace,
           t.family_expires_at <= now() as family_expired,
           ${familyRevoked} as family_revoked
      from refresh_tokens as t
     where t.token_hash = ${tokenHash}
  `);
  const [row] = rows;
  return (
    row && {
      id: row.id,
      userId: row.user_id,
      familyId: row.family_id,
      rotated: row.rotated,
      withinGrace: row.within_grace,
      familyExpired: row.family_expired,
      familyRevoked: row.family_revoked,
    }
  );
}

/** Ends one login session: every token of the family. Returns how many rows changed. */
export async function revokeFamily(executor: Executor, familyId: string): Promise<number> {
  const result = await executor.execute(sql`
    update refresh_tokens set revoked_at = now()
     where family_id = ${familyId} and revoked_at is null
  `);
  return result.rowCount ?? 0;
}

/** Logout: ends the session that the presented token belongs to, whatever state the token is in. */
export async function revokeFamilyOfToken(executor: Executor, tokenHash: string): Promise<number> {
  const result = await executor.execute(sql`
    update refresh_tokens set revoked_at = now()
     where family_id = (select family_id from refresh_tokens where token_hash = ${tokenHash})
       and revoked_at is null
  `);
  return result.rowCount ?? 0;
}

/** "Log out everywhere": ends every session of the user. */
export async function revokeAllForUser(executor: Executor, userId: string): Promise<number> {
  const result = await executor.execute(sql`
    update refresh_tokens set revoked_at = now()
     where user_id = ${userId} and revoked_at is null
  `);
  return result.rowCount ?? 0;
}

/**
 * Housekeeping at each login: deletes the user's sessions that are past their 30-day cap. All
 * tokens of a family share family_expires_at, so whole families go at once; a revoked family is
 * kept until then, because its revoked rows are what keep its other tokens unusable.
 */
export async function deleteExpiredFamilies(executor: Executor, userId: string): Promise<number> {
  const result = await executor.execute(sql`
    delete from refresh_tokens where user_id = ${userId} and family_expires_at <= now()
  `);
  return result.rowCount ?? 0;
}
