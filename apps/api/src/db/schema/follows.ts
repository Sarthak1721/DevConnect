import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './columns';
import { users } from './users';

/**
 * follows: "follower follows followee" (a self-referencing many-to-many on users).
 *
 * The primary key (follower_id, followee_id) makes a duplicate follow impossible, and the API can
 * use INSERT ... ON CONFLICT DO NOTHING to make "follow" safe to repeat.
 */
export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    // Leading column follower_id also answers "whom do I follow?" for the feed.
    primaryKey({ name: 'follows_pkey', columns: [t.followerId, t.followeeId] }),
    check('follows_not_self', sql`${t.followerId} <> ${t.followeeId}`),
    // Followers list, newest first, paginated by (created_at, follower_id); also serves cascades.
    index('follows_followee_created_idx').on(
      t.followeeId,
      t.createdAt.desc().nullsFirst(),
      t.followerId.desc().nullsFirst(),
    ),
    // Following list, newest first.
    index('follows_follower_created_idx').on(
      t.followerId,
      t.createdAt.desc().nullsFirst(),
      t.followeeId.desc().nullsFirst(),
    ),
  ],
);
