import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type CounterDrift = {
  counter: string;
  id: string;
  stored: number;
  actual: number;
};

/**
 * Recomputes every denormalized counter from the rows it summarizes and returns the ones whose
 * stored value disagrees (an empty array means every counter is correct).
 *
 * It reads every row of the involved tables, so it's for tests, seed scripts and occasional audits,
 * never for request handlers. GROUP BY p.id may list p.like_count without aggregating it because
 * id is the primary key: every other column of that row is determined by it.
 */
export async function findCounterDrift(db: NodePgDatabase, limit = 20): Promise<CounterDrift[]> {
  const result = await db.execute<CounterDrift>(sql`
    SELECT * FROM (
      SELECT 'posts.like_count' AS counter, p.id::text AS id,
             p.like_count AS stored, count(l.post_id)::int AS actual
      FROM posts p LEFT JOIN post_likes l ON l.post_id = p.id
      GROUP BY p.id HAVING p.like_count <> count(l.post_id)

      UNION ALL
      SELECT 'posts.comment_count', p.id::text, p.comment_count, count(c.id)::int
      FROM posts p LEFT JOIN comments c ON c.post_id = p.id
      GROUP BY p.id HAVING p.comment_count <> count(c.id)

      UNION ALL
      SELECT 'users.post_count', u.id::text, u.post_count, count(p.id)::int
      FROM users u LEFT JOIN posts p ON p.author_id = u.id
      GROUP BY u.id HAVING u.post_count <> count(p.id)

      UNION ALL
      SELECT 'users.follower_count', u.id::text, u.follower_count, count(f.follower_id)::int
      FROM users u LEFT JOIN follows f ON f.followee_id = u.id
      GROUP BY u.id HAVING u.follower_count <> count(f.follower_id)

      UNION ALL
      SELECT 'users.following_count', u.id::text, u.following_count, count(f.followee_id)::int
      FROM users u LEFT JOIN follows f ON f.follower_id = u.id
      GROUP BY u.id HAVING u.following_count <> count(f.followee_id)
    ) AS drift
    LIMIT ${limit}
  `);
  return result.rows;
}
