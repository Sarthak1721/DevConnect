import { eq, sql } from 'drizzle-orm';
import { expect } from 'vitest';
import { db } from '../../src/db/client';
import { posts, users } from '../../src/db/schema';
import { findPgError } from '../../src/lib/pg-errors';

/**
 * Empties every table before each test, so tests can't affect each other.
 * TRUNCATE is far faster than DELETE (it drops the data files instead of removing rows one by
 * one). users and skills are the roots; CASCADE empties every table that references them.
 */
export async function resetDatabase(): Promise<void> {
  await db.execute(sql`TRUNCATE users, skills CASCADE`);
}

/**
 * Asserts that a query is rejected by the database with a specific error: the SQLSTATE code
 * (e.g. 23505 = unique violation) and the name of the constraint that refused it.
 */
export async function expectDbError(
  query: PromiseLike<unknown>,
  expected: { code: string; constraint: string },
): Promise<void> {
  let thrown: unknown;
  try {
    await query;
  } catch (error) {
    thrown = error;
  }
  expect(thrown, 'expected the database to reject this query').toBeDefined();
  const pgError = findPgError(thrown);
  expect({ code: pgError?.code, constraint: pgError?.constraint }).toEqual(expected);
}

/** Current counters of one post. */
export async function postCounts(postId: string) {
  const [row] = await db
    .select({ likeCount: posts.likeCount, commentCount: posts.commentCount })
    .from(posts)
    .where(eq(posts.id, postId));
  return row;
}

/** Current counters of one user. */
export async function userCounts(userId: string) {
  const [row] = await db
    .select({
      followerCount: users.followerCount,
      followingCount: users.followingCount,
      postCount: users.postCount,
    })
    .from(users)
    .where(eq(users.id, userId));
  return row;
}
