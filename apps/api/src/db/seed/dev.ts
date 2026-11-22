// `pnpm db:seed`: replaces ALL data in your local database with a small, realistic dataset
// (8 fictional developers with profiles, skills, posts, likes, comments and follows).
//
// Everything happens in one transaction: if any insert fails, nothing changes.
import { sql } from 'drizzle-orm';
import { logger } from '../../lib/logger';
import { createDatabase } from '../client';
import { findCounterDrift } from '../counter-drift';
import {
  comments,
  follows,
  postLikes,
  posts,
  profiles,
  skills,
  userSkills,
  users,
} from '../schema';
import { CONVERSATIONS, DEVELOPERS, FOLLOWS, SKILLS } from './dev-data';
import { SEED_PASSWORD_HASH, assertLocalDevelopmentDatabase } from './guard';

function lookup<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Seed data refers to an unknown key: ${String(key)}`);
  return value;
}

const target = assertLocalDevelopmentDatabase();
const { pool, db } = createDatabase({ maxConnections: 1 });

try {
  await db.transaction(async (tx) => {
    // 1. Start from empty. users and skills are the roots; CASCADE empties every other table.
    await tx.execute(sql`TRUNCATE users, skills CASCADE`);

    // 2. Skills.
    const skillRows = await tx
      .insert(skills)
      .values(SKILLS.map(([name, slug]) => ({ name, slug })))
      .returning({ id: skills.id, slug: skills.slug });
    const skillIds = new Map<string, string>(skillRows.map((row) => [row.slug, row.id]));

    // 3. Users, their profiles and their skills.
    const userRows = await tx
      .insert(users)
      .values(
        DEVELOPERS.map((dev) => ({
          email: `${dev.username}@example.com`,
          username: dev.username,
          name: dev.name,
          passwordHash: SEED_PASSWORD_HASH,
        })),
      )
      .returning({ id: users.id, username: users.username });
    const userIds = new Map(userRows.map((row) => [row.username, row.id]));

    await tx.insert(profiles).values(
      DEVELOPERS.map((dev) => ({
        userId: lookup(userIds, dev.username),
        headline: dev.headline,
        bio: dev.bio,
        location: dev.location,
        portfolioUrl: `https://example.com/${dev.username}`,
        socialLinks: { website: `https://example.com/${dev.username}` },
        experience: dev.experience ?? [],
        education: dev.education ?? [],
      })),
    );
    await tx.insert(userSkills).values(
      DEVELOPERS.flatMap((dev) =>
        dev.skills.map((slug, position) => ({
          userId: lookup(userIds, dev.username),
          skillId: lookup(skillIds, slug),
          position,
        })),
      ),
    );

    // 4. Posts, dated in the past so timelines look natural.
    const now = Date.now();
    const postRows = await tx
      .insert(posts)
      .values(
        DEVELOPERS.flatMap((dev) =>
          dev.posts.map((post) => ({
            authorId: lookup(userIds, dev.username),
            content: post.content,
            createdAt: new Date(now - post.hoursAgo * 3_600_000),
          })),
        ),
      )
      .returning({ id: posts.id, content: posts.content });
    const postIdByContent = new Map(postRows.map((row) => [row.content, row.id]));
    const postIdOf = (username: string, index: number) => {
      const content = DEVELOPERS.find((dev) => dev.username === username)?.posts[index]?.content;
      return lookup(postIdByContent, content ?? `${username}#${index}`);
    };

    // 5. Follows, and likes that follow the social graph: you like the posts of people you follow.
    await tx.insert(follows).values(
      FOLLOWS.map(([follower, followee]) => ({
        followerId: lookup(userIds, follower),
        followeeId: lookup(userIds, followee),
      })),
    );
    await tx.insert(postLikes).values(
      FOLLOWS.flatMap(([follower, followee]) =>
        (DEVELOPERS.find((dev) => dev.username === followee)?.posts ?? []).map((_, index) => ({
          userId: lookup(userIds, follower),
          postId: postIdOf(followee, index),
        })),
      ),
    );

    // 6. Conversations: a top-level comment, then replies pointing at it.
    for (const conversation of CONVERSATIONS) {
      const postId = postIdOf(...conversation.post);
      const [commentAuthor, commentText] = conversation.comment;
      const [comment] = await tx
        .insert(comments)
        .values({ postId, authorId: lookup(userIds, commentAuthor), content: commentText })
        .returning({ id: comments.id });
      if (!comment) throw new Error('Comment insert returned no row');

      for (const [replyAuthor, replyText] of conversation.replies ?? []) {
        await tx.insert(comments).values({
          postId,
          parentId: comment.id,
          authorId: lookup(userIds, replyAuthor),
          content: replyText,
        });
      }
    }
  });

  // The triggers maintained every counter during the inserts above; prove it.
  const drift = await findCounterDrift(db);
  if (drift.length > 0) throw new Error(`Counter drift after seeding: ${JSON.stringify(drift)}`);

  const counts = await db.execute<Record<string, number>>(sql`
    SELECT (SELECT count(*)::int FROM users) AS users,
           (SELECT count(*)::int FROM posts) AS posts,
           (SELECT count(*)::int FROM post_likes) AS likes,
           (SELECT count(*)::int FROM comments) AS comments,
           (SELECT count(*)::int FROM follows) AS follows,
           (SELECT count(*)::int FROM skills) AS skills
  `);
  logger.info({ counts: counts.rows[0] }, `Seeded ${target}. Counters verified.`);
  logger.info('Every seeded account uses the password: seed-password-for-local-dev');
} catch (error) {
  logger.fatal(
    { err: error },
    'Seeding failed. If an insert failed, the transaction was rolled back and nothing changed.',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
