// `pnpm db:seed:large`: replaces ALL data in your local database with a large synthetic dataset
// for performance work (feed and search benchmarks, EXPLAIN ANALYZE, load tests).
//
//   pnpm db:seed:large                                  10,000 users, 100,000 posts (default)
//   pnpm db:seed:large --posts 1000000                  the Phase 9 benchmark size
//   pnpm db:seed:large --users 2000 --posts 20000       a quick one
//
// Every row is generated INSIDE Postgres with generate_series(): one INSERT ... SELECT per table,
// instead of sending millions of rows from Node one by one. The counter triggers stay on: they run
// once per statement and apply aggregated updates, so they cost seconds, not hours.
//
// The script prints how long each step took and how big each table became. Those numbers are
// measurements of YOUR machine; record them, don't quote someone else's.
import { sql } from 'drizzle-orm';
import { parseArgs } from 'node:util';
import { logger } from '../../lib/logger';
import { createDatabase } from '../client';
import { findCounterDrift } from '../counter-drift';
import { SKILLS } from './dev-data';
import { SEED_PASSWORD_HASH, assertLocalDevelopmentDatabase } from './guard';

const { values: args } = parseArgs({
  options: {
    users: { type: 'string', default: '10000' },
    posts: { type: 'string', default: '100000' },
    'follows-per-user': { type: 'string', default: '50' },
    'likes-per-post': { type: 'string', default: '3' },
    'comments-per-post': { type: 'string', default: '1' },
  },
});

function positiveInt(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} must be a whole number`);
  return value;
}

const config = {
  users: positiveInt('users', args.users),
  posts: positiveInt('posts', args.posts),
  followsPerUser: positiveInt('follows-per-user', args['follows-per-user']),
  likesPerPost: positiveInt('likes-per-post', args['likes-per-post']),
  commentsPerPost: positiveInt('comments-per-post', args['comments-per-post']),
};
if (config.users < 2) throw new Error('--users must be at least 2');

const target = assertLocalDevelopmentDatabase();
// No statement timeout: single statements here insert millions of rows on purpose.
const { pool, db } = createDatabase({ maxConnections: 1, statementTimeoutMs: 0 });

/** Runs one step and logs how long it took (wall-clock, on this machine). */
async function step(label: string, work: () => Promise<unknown>): Promise<void> {
  const started = performance.now();
  await work();
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  logger.info(`${label.padEnd(44)} ${seconds.padStart(7)} s`);
}

const startedAt = performance.now();
logger.info({ config }, `Generating a large dataset in ${target}`);

try {
  await step('Empty all tables', () => db.execute(sql`TRUNCATE users, skills CASCADE`));

  await step('Skills', () =>
    db.execute(sql`
      INSERT INTO skills (name, slug)
      SELECT name, slug
      FROM jsonb_to_recordset(${JSON.stringify(SKILLS.map(([name, slug]) => ({ name, slug })))}::jsonb)
           AS s(name text, slug text)
    `),
  );

  await step(`Users (${config.users.toLocaleString('en-US')}) + profiles`, async () => {
    await db.execute(sql`
      INSERT INTO users (email, username, name, password_hash, created_at)
      SELECT 'load-user-' || g || '@example.com', 'load-user-' || g, 'Load Test User ' || g,
             ${SEED_PASSWORD_HASH}, now() - random() * interval '730 days'
      FROM generate_series(1, ${config.users}::int) AS g
    `);
    await db.execute(sql`
      INSERT INTO profiles (user_id, headline)
      SELECT id, 'Developer #' || substr(id::text, 1, 8) FROM users
    `);
  });

  // A numbered list of users (1..N), so the steps below can pick users by number.
  // MATERIALIZED: compute it once, then join against it by equality (a cheap hash join).
  const numberedUsers = sql`
    numbered AS MATERIALIZED (SELECT id, row_number() OVER (ORDER BY id)::int AS n FROM users)
  `;

  await step('User skills (3 each)', () =>
    db.execute(sql`
      WITH ${numberedUsers},
      skill_list AS MATERIALIZED (
        SELECT id, row_number() OVER (ORDER BY slug)::int - 1 AS k, count(*) OVER ()::int AS total
        FROM skills
      )
      INSERT INTO user_skills (user_id, skill_id, position)
      SELECT u.id, s.id, p.position
      FROM numbered u
      CROSS JOIN generate_series(0, 2) AS p(position)
      JOIN skill_list s ON s.k = (u.n * 7 + p.position * 5) % s.total
    `),
  );

  // Who follows whom. Real social graphs are skewed: a few accounts have most of the followers.
  // power(random(), 3) piles the picks up near user #1, so low-numbered users become "popular".
  await step(`Follows (~${config.followsPerUser} per user)`, () =>
    db.execute(sql`
      WITH ${numberedUsers},
      picks AS MATERIALIZED (
        SELECT u.n AS follower_n,
               1 + floor(power(random(), 3) * ${config.users}::int)::int AS followee_n
        FROM numbered u CROSS JOIN generate_series(1, ${config.followsPerUser}::int)
      )
      INSERT INTO follows (follower_id, followee_id, created_at)
      SELECT f.id, t.id, now() - random() * interval '365 days'
      FROM picks p
      JOIN numbered f ON f.n = p.follower_n
      JOIN numbered t ON t.n = p.followee_n
      WHERE f.id <> t.id
      ON CONFLICT DO NOTHING
    `),
  );

  // Posts, spread over the last year. Active users post more (power(random(), 2) skew).
  // The text is built from a small vocabulary, so full-text search has real words to find.
  await step(`Posts (${config.posts.toLocaleString('en-US')})`, () =>
    db.execute(sql`
      WITH ${numberedUsers},
      picks AS MATERIALIZED (
        SELECT g, 1 + floor(power(random(), 2) * ${config.users}::int)::int AS author_n
        FROM generate_series(1, ${config.posts}::int) AS g
      )
      INSERT INTO posts (author_id, content, created_at)
      SELECT u.id,
             (ARRAY['Shipped', 'Debugging', 'Refactoring', 'Benchmarking', 'Learning', 'Reviewing'])[1 + g % 6]
             || ' ' ||
             (ARRAY['a Postgres query', 'React hooks', 'a Rust CLI', 'Docker builds', 'TypeScript generics',
                    'a Go service', 'Redis caching', 'a Python notebook', 'GraphQL resolvers', 'Kubernetes manifests'])[1 + (g / 6) % 10]
             || ' today. ' ||
             (ARRAY['Lessons learned below.', 'Thread incoming.', 'Any tips?', 'Pairing tomorrow.', 'Notes in my blog.'])[1 + (g / 60) % 5]
             || ' #' || g,
             now() - random() * interval '365 days'
      FROM picks p JOIN numbered u ON u.n = p.author_n
    `),
  );

  await step(`Likes (~${config.likesPerPost} per post)`, () =>
    db.execute(sql`
      WITH ${numberedUsers},
      picks AS MATERIALIZED (
        SELECT p.id AS post_id, p.created_at,
               1 + floor(random() * ${config.users}::int)::int AS user_n
        FROM posts p CROSS JOIN generate_series(1, ${config.likesPerPost}::int)
      )
      INSERT INTO post_likes (user_id, post_id, created_at)
      SELECT u.id, k.post_id, least(now(), k.created_at + random() * interval '3 days')
      FROM picks k JOIN numbered u ON u.n = k.user_n
      ON CONFLICT DO NOTHING
    `),
  );

  await step(`Comments (~${config.commentsPerPost} per post)`, () =>
    db.execute(sql`
      WITH ${numberedUsers},
      picks AS MATERIALIZED (
        SELECT p.id AS post_id, p.created_at,
               1 + floor(random() * ${config.users}::int)::int AS user_n
        FROM posts p CROSS JOIN generate_series(1, ${config.commentsPerPost}::int)
      )
      INSERT INTO comments (post_id, author_id, content, created_at)
      SELECT k.post_id, u.id, 'Great point, thanks for sharing!',
             least(now(), k.created_at + random() * interval '3 days')
      FROM picks k JOIN numbered u ON u.n = k.user_n
    `),
  );

  // Every counter update above wrote a new version of a post/user row (that's how Postgres's MVCC
  // works: the old version stays until VACUUM removes it). VACUUM cleans those up and marks pages
  // all-visible (which index-only scans need); ANALYZE refreshes the planner's statistics. Without
  // this, EXPLAIN would show plans for a table full of dead rows.
  await step('VACUUM ANALYZE (clean up + statistics)', () => db.execute(sql`VACUUM (ANALYZE)`));

  let driftCount = 0;
  await step('Verify every counter (recount from scratch)', async () => {
    driftCount = (await findCounterDrift(db, 100)).length;
  });
  if (driftCount > 0) throw new Error(`${driftCount}+ counters disagree with a fresh COUNT(*)`);

  const sizes = await db.execute<{ table: string; rows: string; total_size: string }>(sql`
    SELECT c.relname AS "table",
           to_char(c.reltuples::bigint, 'FM999,999,999,999') AS rows,
           pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC
  `);
  // Plain console output for the final summary: it's a table meant for you to read and record.
  console.log(`\nDone in ${((performance.now() - startedAt) / 1000).toFixed(1)} s. Table sizes:`);
  console.table(sizes.rows); // total_size includes the table's indexes
} catch (error) {
  logger.fatal({ err: error }, 'Generating the large dataset failed.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
