import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId, timestamptz, tsvector, updatedAt } from './columns';
import { users } from './users';

export const posts = pgTable(
  'posts',
  {
    id: primaryId(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    imageUrl: text('image_url'),
    imagePublicId: text('image_public_id'),
    // Maintained by triggers (migration 0002), never written by the API.
    likeCount: integer('like_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    // The post's words reduced to their roots ("running" -> "run"), computed by Postgres on every
    // insert/update and STORED so it can be indexed. Postgres 18 makes generated columns VIRTUAL by
    // default; Drizzle always writes STORED, which is what we need.
    searchVector: tsvector('search_vector')
      .notNull()
      .generatedAlwaysAs(sql`to_tsvector('english', content)`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    editedAt: timestamptz('edited_at'), // set when the content changes (shown as "edited")
  },
  (t) => [
    // 1–3,000 characters and not only whitespace.
    check(
      'posts_content_valid',
      sql`char_length(${t.content}) between 1 and 3000 and ${t.content} ~ '[^[:space:]]'`,
    ),
    check('posts_image_url_https', sql`${t.imageUrl} ~ '^https://'`),
    check(
      'posts_image_fields_together',
      sql`(${t.imageUrl} is null) = (${t.imagePublicId} is null)`,
    ),
    check('posts_counts_non_negative', sql`${t.likeCount} >= 0 and ${t.commentCount} >= 0`),
    // Profile timeline and the personalized feed ("posts by these authors, newest first"),
    // keyset-paginated by (created_at, id). Also makes deleting a user's posts fast.
    //
    // Why .nullsFirst(): in Postgres, ORDER BY x DESC means DESC NULLS FIRST, and an index can
    // only replace the sort when its null ordering matches. Drizzle's .desc() alone writes
    // DESC NULLS LAST, and the planner then sorts the whole table instead (see docs/database.md).
    index('posts_author_created_idx').on(
      t.authorId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    // Explore timeline: every post, newest first.
    index('posts_created_idx').on(t.createdAt.desc().nullsFirst(), t.id.desc().nullsFirst()),
    // Full-text search: an inverted index from each word to the posts containing it.
    index('posts_search_vector_idx').using('gin', t.searchVector),
  ],
);

/** post_likes: one row per (user, post). The primary key makes a second like impossible. */
export const postLikes = pgTable(
  'post_likes',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    // Leading user_id answers "which of these 20 posts did I like?" for a feed page.
    primaryKey({ name: 'post_likes_pkey', columns: [t.userId, t.postId] }),
    // "Who liked this post", and fast cascades when a post is deleted. Postgres does NOT index
    // foreign-key columns automatically: without this, deleting one post would scan every like.
    index('post_likes_post_created_idx').on(t.postId, t.createdAt),
  ],
);

/**
 * comments: top-level comments (parent_id NULL) and one level of replies.
 *
 * Two rules a CHECK constraint can't express, because they involve another row:
 *  1. A reply belongs to the same post as its parent: the composite foreign key
 *     (parent_id, post_id) -> (id, post_id) below.
 *  2. Replies go one level deep: a trigger in migration 0002.
 */
export const comments = pgTable(
  'comments',
  {
    id: primaryId(),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'),
    content: text('content').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    // A foreign key must point at a unique column set, so (id, post_id) gets its own unique key.
    unique('comments_id_post_key').on(t.id, t.postId),
    // MATCH SIMPLE (the default): for a top-level comment parent_id is NULL and the key isn't checked.
    foreignKey({
      name: 'comments_parent_same_post_fk',
      columns: [t.parentId, t.postId],
      foreignColumns: [t.id, t.postId],
    }).onDelete('cascade'),
    check(
      'comments_content_valid',
      sql`char_length(${t.content}) between 1 and 1000 and ${t.content} ~ '[^[:space:]]'`,
    ),
    // A post's comment thread in order, and fast cascades when a post is deleted. Deliberately
    // NOT a partial index (WHERE parent_id IS NULL): the cascade looks up replies too.
    index('comments_post_created_idx').on(t.postId, t.createdAt, t.id),
    // Replies to one comment, in order (and cascades when a parent comment is deleted).
    index('comments_parent_created_idx').on(t.parentId, t.createdAt),
    // Fast cascades when a user is deleted.
    index('comments_author_idx').on(t.authorId),
  ],
);
