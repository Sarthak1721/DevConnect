import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, primaryId, timestamptz } from './columns';
import { users } from './users';

/**
 * refresh_tokens: server-side state for refresh tokens (used from Phase 3, see docs/adr/0006).
 *
 * The raw token only ever exists in the user's HttpOnly cookie. We store its SHA-256 hash, so a
 * leaked database backup can't be replayed as live sessions.
 *
 * Every refresh "rotates": the presented token is marked rotated and a successor is issued in the
 * same family. If an already-rotated token comes back, someone copied it, and the whole family is
 * revoked (reuse detection).
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: primaryId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').notNull(), // one login session = one family
    tokenHash: text('token_hash').notNull(), // hex-encoded SHA-256
    createdAt: createdAt(),
    expiresAt: timestamptz('expires_at').notNull(), // slides forward on each refresh (7 days)
    familyExpiresAt: timestamptz('family_expires_at').notNull(), // hard cap for the session (30 days)
    rotatedAt: timestamptz('rotated_at'),
    revokedAt: timestamptz('revoked_at'),
    // The successor's id, for auditing a chain. Not a foreign key on purpose: that would need yet
    // another index on a write-heavy table, for a column we never join on.
    replacedBy: uuid('replaced_by'),
    userAgent: text('user_agent'),
  },
  (t) => [
    uniqueIndex('refresh_tokens_token_hash_key').on(t.tokenHash), // lookup on every refresh
    index('refresh_tokens_family_idx').on(t.familyId), // revoke a family
    index('refresh_tokens_user_idx').on(t.userId), // "log out everywhere" + cascades
    // Every refresh asks "has this token's family been revoked?" (docs/adr/0011). A partial index
    // holds only the revoked tokens, so the answer is one lookup in a small index instead of a
    // walk through every token the session ever had (one per refresh, so up to ~2,900 in 30 days).
    index('refresh_tokens_revoked_family_idx')
      .on(t.familyId)
      .where(sql`${t.revokedAt} is not null`),
    check('refresh_tokens_token_hash_format', sql`${t.tokenHash} ~ '^[0-9a-f]{64}$'`),
    check(
      'refresh_tokens_expiry_valid',
      sql`${t.expiresAt} > ${t.createdAt} and ${t.expiresAt} <= ${t.familyExpiresAt}`,
    ),
    check('refresh_tokens_user_agent_length', sql`char_length(${t.userAgent}) <= 512`),
  ],
);
