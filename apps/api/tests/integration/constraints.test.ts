import { count, eq, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client';
import {
  comments,
  follows,
  githubAccounts,
  githubRepositories,
  postLikes,
  posts,
  profiles,
  refreshTokens,
  skills,
  userSkills,
  users,
  type SocialLinks,
} from '../../src/db/schema';
import { PG_ERROR_CODES } from '../../src/lib/pg-errors';
import { expectDbError, resetDatabase } from '../helpers/db';
import { createComment, createPost, createUser, follow, likePost } from '../helpers/factories';

// These tests talk to the database directly, below the API. They prove that the rules hold no
// matter which code path writes the data: a bug in a future endpoint can't break them.
const { UNIQUE_VIOLATION, CHECK_VIOLATION, FOREIGN_KEY_VIOLATION } = PG_ERROR_CODES;

async function countRows(table: PgTable): Promise<number | undefined> {
  const [row] = await db.select({ value: count() }).from(table);
  return row?.value;
}

beforeEach(resetDatabase);

describe('users', () => {
  it('rejects a second account with the same email', async () => {
    await createUser({ email: 'ada@example.com' });

    await expectDbError(createUser({ email: 'ada@example.com' }), {
      code: UNIQUE_VIOLATION,
      constraint: 'users_email_key',
    });
  });

  it('stores emails in lower case only, so uniqueness is case-insensitive', async () => {
    await expectDbError(createUser({ email: 'Ada@Example.com' }), {
      code: CHECK_VIOLATION,
      constraint: 'users_email_valid',
    });
  });

  it.each(['ab', 'x'.repeat(31), '-ada', 'ada-', 'a--da', 'Ada', 'ada_l', 'ada l'])(
    'rejects the username %j',
    async (username) => {
      await expectDbError(createUser({ username }), {
        code: CHECK_VIOLATION,
        constraint: 'users_username_format',
      });
    },
  );

  it.each(['ada', 'ada-lovelace', 'dev-2026', 'x'.repeat(30)])(
    'accepts the username %j',
    async (username) => {
      await expect(createUser({ username })).resolves.toMatchObject({ username });
    },
  );

  it('can never contain "me", which GET /users/me relies on (3-character minimum)', async () => {
    await expectDbError(createUser({ username: 'me' }), {
      code: CHECK_VIOLATION,
      constraint: 'users_username_format',
    });
  });

  it.each(['', ' Ada', 'Ada ', 'x'.repeat(51)])('rejects the display name %j', async (name) => {
    await expectDbError(createUser({ name }), {
      code: CHECK_VIOLATION,
      constraint: 'users_name_valid',
    });
  });

  it('requires the avatar URL and its Cloudinary id together', async () => {
    await expectDbError(createUser({ avatarUrl: 'https://res.cloudinary.com/demo/a.webp' }), {
      code: CHECK_VIOLATION,
      constraint: 'users_avatar_fields_together',
    });
  });
});

describe('profiles', () => {
  it('rejects portfolio links that are not http(s), such as javascript: URLs', async () => {
    const user = await createUser();

    await expectDbError(
      db
        .update(profiles)
        .set({ portfolioUrl: 'javascript:alert(1)' })
        .where(eq(profiles.userId, user.id)),
      { code: CHECK_VIOLATION, constraint: 'profiles_portfolio_url_valid' },
    );
  });

  it('caps experience at 20 entries', async () => {
    const user = await createUser();
    const entry = { title: 'Engineer', company: 'Acme', startDate: '2024-01', endDate: null };

    await expectDbError(
      db
        .update(profiles)
        .set({ experience: Array.from({ length: 21 }, () => entry) })
        .where(eq(profiles.userId, user.id)),
      { code: CHECK_VIOLATION, constraint: 'profiles_experience_max_20' },
    );
  });

  it('requires social_links to be a JSON object', async () => {
    const user = await createUser();

    await expectDbError(
      db
        .update(profiles)
        .set({ socialLinks: ['https://github.com/ada'] as unknown as SocialLinks })
        .where(eq(profiles.userId, user.id)),
      { code: CHECK_VIOLATION, constraint: 'profiles_social_links_is_object' },
    );
  });
});

describe('user_skills', () => {
  it('allows at most 20 skills per user (positions 0-19, unique per user)', async () => {
    const user = await createUser();
    const created = await db
      .insert(skills)
      .values(Array.from({ length: 21 }, (_, i) => ({ name: `Skill ${i}`, slug: `skill-${i}` })))
      .returning();
    const extra = created.pop();
    if (!extra) throw new Error('expected 21 skills');

    await db
      .insert(userSkills)
      .values(created.map((skill, position) => ({ userId: user.id, skillId: skill.id, position })));

    await expectDbError(
      db.insert(userSkills).values({ userId: user.id, skillId: extra.id, position: 20 }),
      { code: CHECK_VIOLATION, constraint: 'user_skills_position_range' },
    );
    await expectDbError(
      db.insert(userSkills).values({ userId: user.id, skillId: extra.id, position: 0 }),
      { code: UNIQUE_VIOLATION, constraint: 'user_skills_user_position_key' },
    );
  });
});

describe('follows', () => {
  it('rejects following yourself', async () => {
    const ada = await createUser();

    await expectDbError(follow(ada.id, ada.id), {
      code: CHECK_VIOLATION,
      constraint: 'follows_not_self',
    });
  });

  it('rejects a duplicate follow, and ON CONFLICT DO NOTHING makes repeating safe', async () => {
    const [ada, linus] = [await createUser(), await createUser()];
    await follow(ada.id, linus.id);

    await expectDbError(db.insert(follows).values({ followerId: ada.id, followeeId: linus.id }), {
      code: UNIQUE_VIOLATION,
      constraint: 'follows_pkey',
    });
    // What the API's repeat-safe "follow" does: nothing inserted, no error.
    await expect(follow(ada.id, linus.id)).resolves.toEqual([]);
  });
});

describe('posts', () => {
  it.each([
    ['empty', ''],
    ['whitespace only', '  \n\t '],
    ['over 3,000 characters', 'x'.repeat(3001)],
  ])('rejects %s content', async (_label, content) => {
    const author = await createUser();

    await expectDbError(createPost(author.id, { content }), {
      code: CHECK_VIOLATION,
      constraint: 'posts_content_valid',
    });
  });

  it('accepts exactly 3,000 characters', async () => {
    const author = await createUser();

    await expect(createPost(author.id, { content: 'x'.repeat(3000) })).resolves.toBeDefined();
  });

  it('rejects a duplicate like', async () => {
    const author = await createUser();
    const post = await createPost(author.id);
    await likePost(author.id, post.id);

    await expectDbError(db.insert(postLikes).values({ userId: author.id, postId: post.id }), {
      code: UNIQUE_VIOLATION,
      constraint: 'post_likes_pkey',
    });
  });
});

describe('comments', () => {
  it('accepts a reply to a top-level comment', async () => {
    const author = await createUser();
    const post = await createPost(author.id);
    const comment = await createComment(post.id, author.id);

    await expect(
      createComment(post.id, author.id, { parentId: comment.id }),
    ).resolves.toMatchObject({ parentId: comment.id });
  });

  it('rejects a reply to a reply (replies go one level deep)', async () => {
    const author = await createUser();
    const post = await createPost(author.id);
    const comment = await createComment(post.id, author.id);
    const reply = await createComment(post.id, author.id, { parentId: comment.id });

    await expectDbError(createComment(post.id, author.id, { parentId: reply.id }), {
      code: CHECK_VIOLATION,
      constraint: 'comments_one_reply_level',
    });
  });

  it('rejects a reply whose parent belongs to a different post', async () => {
    const author = await createUser();
    const [postA, postB] = [await createPost(author.id), await createPost(author.id)];
    const commentOnA = await createComment(postA.id, author.id);

    await expectDbError(createComment(postB.id, author.id, { parentId: commentOnA.id }), {
      code: FOREIGN_KEY_VIOLATION,
      constraint: 'comments_parent_same_post_fk',
    });
  });
});

describe('refresh_tokens', () => {
  it('only stores hex-encoded SHA-256 digests, never a raw token', async () => {
    const user = await createUser();
    const now = Date.now();

    await expectDbError(
      db.insert(refreshTokens).values({
        userId: user.id,
        familyId: user.id,
        tokenHash: 'raw-token-that-should-have-been-hashed',
        expiresAt: new Date(now + 7 * 86_400_000),
        familyExpiresAt: new Date(now + 30 * 86_400_000),
      }),
      { code: CHECK_VIOLATION, constraint: 'refresh_tokens_token_hash_format' },
    );
  });
});

describe('cascading deletes', () => {
  it('deleting a user deletes everything that belongs to them', async () => {
    const ada = await createUser();
    const linus = await createUser();
    const post = await createPost(ada.id);
    await createComment(post.id, linus.id);
    await likePost(linus.id, post.id);
    await follow(ada.id, linus.id);
    await follow(linus.id, ada.id);
    const [skill] = await db.insert(skills).values({ name: 'Rust', slug: 'rust' }).returning();
    if (!skill) throw new Error('expected a skill');
    await db.insert(userSkills).values({ userId: ada.id, skillId: skill.id, position: 0 });
    await db.insert(githubAccounts).values({ userId: ada.id, githubUserId: 1, login: 'ada' });
    await db.insert(githubRepositories).values({
      userId: ada.id,
      githubRepoId: 42,
      name: 'engine',
      htmlUrl: 'https://github.com/ada/engine',
    });

    await db.delete(users).where(eq(users.id, ada.id));

    expect(await countRows(profiles)).toBe(1); // Linus's profile
    expect(await countRows(posts)).toBe(0);
    expect(await countRows(comments)).toBe(0);
    expect(await countRows(postLikes)).toBe(0);
    expect(await countRows(follows)).toBe(0);
    expect(await countRows(userSkills)).toBe(0);
    expect(await countRows(githubAccounts)).toBe(0);
    expect(await countRows(githubRepositories)).toBe(0);
    // The skill itself stays: it's shared vocabulary, other users may have it.
    expect(await countRows(skills)).toBe(1);
  });

  it('deleting a top-level comment deletes its replies', async () => {
    const author = await createUser();
    const post = await createPost(author.id);
    const comment = await createComment(post.id, author.id);
    await createComment(post.id, author.id, { parentId: comment.id });
    await createComment(post.id, author.id, { parentId: comment.id });

    await db.delete(comments).where(eq(comments.id, comment.id));

    const [row] = await db
      .select({ value: count() })
      .from(comments)
      .where(eq(comments.postId, post.id));
    expect(row?.value).toBe(0);
  });
});

describe('generated search column', () => {
  it('fills search_vector automatically, reducing words to their roots', async () => {
    const author = await createUser();
    const post = await createPost(author.id, {
      content: 'Benchmarking queries while running Postgres',
    });

    const [row] = await db
      .select({ vector: sql<string>`${posts.searchVector}::text` })
      .from(posts)
      .where(eq(posts.id, post.id));
    expect(row?.vector).toContain("'run'");
    expect(row?.vector).toContain("'benchmark'");
  });
});
