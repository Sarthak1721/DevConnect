import { and, eq } from 'drizzle-orm';
import { db } from '../../src/db/client';
import { comments, follows, postLikes, posts, profiles, users } from '../../src/db/schema';

// Factories: create valid rows with sensible defaults, so each test only spells out what it cares
// about. A counter keeps emails and usernames unique within a run.
let sequence = 0;

function single<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error('Expected the query to return a row');
  return row;
}

export async function createUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  sequence += 1;
  const user = single(
    await db
      .insert(users)
      .values({
        email: `user${sequence}@example.com`,
        username: `user-${sequence}`,
        name: `Test User ${sequence}`,
        passwordHash: 'not-a-real-hash',
        ...overrides,
      })
      .returning(),
  );
  // Registration (Phase 3) creates both rows in one transaction; mirror that here.
  await db.insert(profiles).values({ userId: user.id });
  return user;
}

export async function createPost(
  authorId: string,
  overrides: Partial<typeof posts.$inferInsert> = {},
) {
  return single(
    await db
      .insert(posts)
      .values({ authorId, content: 'Hello DevConnect', ...overrides })
      .returning(),
  );
}

export async function createComment(
  postId: string,
  authorId: string,
  overrides: Partial<typeof comments.$inferInsert> = {},
) {
  return single(
    await db
      .insert(comments)
      .values({ postId, authorId, content: 'Nice post!', ...overrides })
      .returning(),
  );
}

/** Like a post. Safe to repeat: a second like is silently ignored, as the API will do it. */
export async function likePost(userId: string, postId: string) {
  return db.insert(postLikes).values({ userId, postId }).onConflictDoNothing().returning();
}

export async function unlikePost(userId: string, postId: string) {
  return db
    .delete(postLikes)
    .where(and(eq(postLikes.userId, userId), eq(postLikes.postId, postId)))
    .returning();
}

/** Follow a user. Safe to repeat. */
export async function follow(followerId: string, followeeId: string) {
  return db.insert(follows).values({ followerId, followeeId }).onConflictDoNothing().returning();
}

export async function unfollow(followerId: string, followeeId: string) {
  return db
    .delete(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)))
    .returning();
}
