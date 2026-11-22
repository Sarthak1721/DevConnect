import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client';
import { findCounterDrift } from '../../src/db/counter-drift';
import { comments, follows, postLikes, posts, users } from '../../src/db/schema';
import { postCounts, resetDatabase, userCounts } from '../helpers/db';
import {
  createComment,
  createPost,
  createUser,
  follow,
  likePost,
  unfollow,
  unlikePost,
} from '../helpers/factories';

// The counter triggers from migration 0002. Every test also checks the invariant directly:
// stored counter = COUNT(*) of the rows it summarizes (findCounterDrift returns the mismatches).
beforeEach(resetDatabase);

describe('posts.like_count', () => {
  it('goes up on like and back down on unlike', async () => {
    const [author, fan] = [await createUser(), await createUser()];
    const post = await createPost(author.id);

    await likePost(fan.id, post.id);
    expect(await postCounts(post.id)).toMatchObject({ likeCount: 1 });

    await unlikePost(fan.id, post.id);
    expect(await postCounts(post.id)).toMatchObject({ likeCount: 0 });
  });

  it('ignores a repeated like: ON CONFLICT DO NOTHING inserts no row, so no count change', async () => {
    const author = await createUser();
    const post = await createPost(author.id);

    await likePost(author.id, post.id);
    await likePost(author.id, post.id); // double click
    await likePost(author.id, post.id);

    expect(await postCounts(post.id)).toMatchObject({ likeCount: 1 });
  });
});

describe('posts.comment_count', () => {
  it('counts replies too, and drops by all of them when their parent is deleted', async () => {
    const author = await createUser();
    const post = await createPost(author.id);
    const comment = await createComment(post.id, author.id);
    await createComment(post.id, author.id, { parentId: comment.id });
    await createComment(post.id, author.id, { parentId: comment.id });
    expect(await postCounts(post.id)).toMatchObject({ commentCount: 3 });

    await db.delete(comments).where(eq(comments.id, comment.id)); // cascades to both replies

    expect(await postCounts(post.id)).toMatchObject({ commentCount: 0 });
  });
});

describe('users.post_count', () => {
  it('follows posts being created and deleted', async () => {
    const author = await createUser();
    const first = await createPost(author.id);
    await createPost(author.id);
    expect(await userCounts(author.id)).toMatchObject({ postCount: 2 });

    await db.delete(posts).where(eq(posts.id, first.id));

    expect(await userCounts(author.id)).toMatchObject({ postCount: 1 });
  });
});

describe('users.follower_count and following_count', () => {
  it('updates both sides of a follow, and is safe to repeat', async () => {
    const [ada, linus] = [await createUser(), await createUser()];

    await follow(ada.id, linus.id);
    await follow(ada.id, linus.id); // repeated: no change
    expect(await userCounts(ada.id)).toMatchObject({ followingCount: 1, followerCount: 0 });
    expect(await userCounts(linus.id)).toMatchObject({ followingCount: 0, followerCount: 1 });

    await unfollow(ada.id, linus.id);
    expect(await userCounts(ada.id)).toMatchObject({ followingCount: 0 });
    expect(await userCounts(linus.id)).toMatchObject({ followerCount: 0 });
  });
});

describe('statement-level triggers', () => {
  it('apply one aggregated update for a multi-row insert', async () => {
    const [ada, linus, grace] = [await createUser(), await createUser(), await createUser()];
    const [p1, p2] = [await createPost(ada.id), await createPost(ada.id)];

    // One INSERT statement, five rows, two different posts.
    await db.insert(postLikes).values([
      { userId: ada.id, postId: p1.id },
      { userId: linus.id, postId: p1.id },
      { userId: grace.id, postId: p1.id },
      { userId: linus.id, postId: p2.id },
      { userId: grace.id, postId: p2.id },
    ]);

    expect(await postCounts(p1.id)).toMatchObject({ likeCount: 3 });
    expect(await postCounts(p2.id)).toMatchObject({ likeCount: 2 });
  });
});

describe('deleting a user', () => {
  it("lowers OTHER users' counters through the cascades", async () => {
    const [ada, linus, grace] = [await createUser(), await createUser(), await createUser()];
    const linusPost = await createPost(linus.id);
    await likePost(ada.id, linusPost.id);
    await likePost(grace.id, linusPost.id);
    await createComment(linusPost.id, ada.id);
    await follow(ada.id, linus.id);
    await follow(grace.id, ada.id);

    // No application code runs here: the cascades delete Ada's likes, comments and follows, and
    // the triggers fix every counter those rows contributed to.
    await db.delete(users).where(eq(users.id, ada.id));

    expect(await postCounts(linusPost.id)).toEqual({ likeCount: 1, commentCount: 0 });
    expect(await userCounts(linus.id)).toMatchObject({ followerCount: 0 });
    expect(await userCounts(grace.id)).toMatchObject({ followingCount: 0 });
    expect(await findCounterDrift(db)).toEqual([]);
  });
});

describe('invariant under random activity', () => {
  // A tiny seeded pseudo-random generator (mulberry32): "random" but identical on every run, so
  // a failure can always be reproduced.
  function seededRandom(seed: number) {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
  }

  it('keeps every stored counter equal to a fresh COUNT(*) after 300 random operations', async () => {
    const random = seededRandom(2026);
    const pick = <T>(items: T[]): T | undefined => items[Math.floor(random() * items.length)];

    const people = await Promise.all(Array.from({ length: 6 }, () => createUser()));
    const userIds = people.map((person) => person.id);

    for (let step = 0; step < 300; step += 1) {
      const postIds = (await db.select({ id: posts.id }).from(posts)).map((row) => row.id);
      const commentIds = (await db.select({ id: comments.id }).from(comments)).map((r) => r.id);
      const actor = pick(userIds);
      const other = pick(userIds);
      const postId = pick(postIds);
      const commentId = pick(commentIds);
      if (!actor || !other) continue;

      switch (Math.floor(random() * 8)) {
        case 0:
          await createPost(actor);
          break;
        case 1:
          if (postId) await likePost(actor, postId);
          break;
        case 2:
          if (postId) await unlikePost(actor, postId);
          break;
        case 3:
          if (postId) await createComment(postId, actor);
          break;
        case 4: // may cascade to replies
          if (commentId) await db.delete(comments).where(eq(comments.id, commentId));
          break;
        case 5:
          if (actor !== other) await follow(actor, other);
          break;
        case 6: // one statement deleting several rows at once
          await db.delete(follows).where(eq(follows.followerId, actor));
          break;
        case 7: // rarer: cascades to the post's likes and comments
          if (postId && random() < 0.3) await db.delete(posts).where(eq(posts.id, postId));
          break;
      }
    }

    // The run must actually have produced data, or the check below would prove nothing.
    expect((await db.select().from(posts)).length).toBeGreaterThan(0);
    expect((await db.select().from(postLikes)).length).toBeGreaterThan(0);
    expect(await findCounterDrift(db)).toEqual([]);
  });
});
