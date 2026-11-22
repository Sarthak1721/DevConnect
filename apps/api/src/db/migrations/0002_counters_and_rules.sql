-- Custom SQL migration: rules drizzle-kit can't express (triggers). See docs/adr/0010.
--
-- PART 1: denormalized counters
--   posts.like_count, posts.comment_count, users.post_count, users.follower_count, users.following_count
--
-- The database keeps them correct itself, whichever code path inserts or deletes rows, including
-- ON DELETE CASCADE, which application code never sees (delete a user -> their likes vanish ->
-- other people's posts must lose those likes).
--
-- Three design choices:
--   * FOR EACH STATEMENT + transition tables: the trigger runs once per statement and sees every
--     changed row in `changed_rows`, so it can apply one aggregated UPDATE per parent row. A
--     million-row bulk insert costs one UPDATE per affected post, not a million.
--   * INSERT ... ON CONFLICT DO NOTHING (a repeated like) inserts nothing, so `changed_rows` is
--     empty and the count doesn't move.
--   * Before updating, parent rows are locked in primary-key order. Concurrent statements then
--     always take their locks in the same order, so counter updates can't deadlock each other
--     (e.g. A follows B while B follows A). FOR NO KEY UPDATE is the same lock the UPDATE takes
--     anyway, and unlike FOR UPDATE it doesn't block inserts whose foreign keys point at the row.

CREATE FUNCTION maintain_post_like_count() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  delta integer := CASE TG_OP WHEN 'INSERT' THEN 1 ELSE -1 END;
BEGIN
  PERFORM 1 FROM posts
  WHERE id IN (SELECT post_id FROM changed_rows)
  ORDER BY id
  FOR NO KEY UPDATE;

  UPDATE posts AS p
  SET like_count = p.like_count + delta * c.n
  FROM (SELECT post_id, count(*) AS n FROM changed_rows GROUP BY post_id) AS c
  WHERE p.id = c.post_id;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER post_likes_count_after_insert
  AFTER INSERT ON post_likes
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION maintain_post_like_count();
--> statement-breakpoint
CREATE TRIGGER post_likes_count_after_delete
  AFTER DELETE ON post_likes
  REFERENCING OLD TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION maintain_post_like_count();
--> statement-breakpoint

-- Every comment counts, replies included.
CREATE FUNCTION maintain_post_comment_count() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  delta integer := CASE TG_OP WHEN 'INSERT' THEN 1 ELSE -1 END;
BEGIN
  PERFORM 1 FROM posts
  WHERE id IN (SELECT post_id FROM changed_rows)
  ORDER BY id
  FOR NO KEY UPDATE;

  UPDATE posts AS p
  SET comment_count = p.comment_count + delta * c.n
  FROM (SELECT post_id, count(*) AS n FROM changed_rows GROUP BY post_id) AS c
  WHERE p.id = c.post_id;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER comments_count_after_insert
  AFTER INSERT ON comments
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION maintain_post_comment_count();
--> statement-breakpoint
CREATE TRIGGER comments_count_after_delete
  AFTER DELETE ON comments
  REFERENCING OLD TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION maintain_post_comment_count();
--> statement-breakpoint

CREATE FUNCTION maintain_user_post_count() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  delta integer := CASE TG_OP WHEN 'INSERT' THEN 1 ELSE -1 END;
BEGIN
  PERFORM 1 FROM users
  WHERE id IN (SELECT author_id FROM changed_rows)
  ORDER BY id
  FOR NO KEY UPDATE;

  UPDATE users AS u
  SET post_count = u.post_count + delta * c.n
  FROM (SELECT author_id, count(*) AS n FROM changed_rows GROUP BY author_id) AS c
  WHERE u.id = c.author_id;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER posts_count_after_insert
  AFTER INSERT ON posts
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION maintain_user_post_count();
--> statement-breakpoint
CREATE TRIGGER posts_count_after_delete
  AFTER DELETE ON posts
  REFERENCING OLD TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION maintain_user_post_count();
--> statement-breakpoint

-- One follow row changes two users: the follower's following_count and the followee's
-- follower_count. Both are updated by a single UPDATE, after locking both users in id order.
CREATE FUNCTION maintain_user_follow_counts() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  delta integer := CASE TG_OP WHEN 'INSERT' THEN 1 ELSE -1 END;
BEGIN
  PERFORM 1 FROM users
  WHERE id IN (SELECT follower_id FROM changed_rows UNION SELECT followee_id FROM changed_rows)
  ORDER BY id
  FOR NO KEY UPDATE;

  UPDATE users AS u
  SET following_count = u.following_count + delta * c.following,
      follower_count  = u.follower_count  + delta * c.followers
  FROM (
    SELECT user_id, sum(following) AS following, sum(followers) AS followers
    FROM (
      SELECT follower_id AS user_id, 1 AS following, 0 AS followers FROM changed_rows
      UNION ALL
      SELECT followee_id AS user_id, 0 AS following, 1 AS followers FROM changed_rows
    ) AS per_row
    GROUP BY user_id
  ) AS c
  WHERE u.id = c.user_id;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER follows_count_after_insert
  AFTER INSERT ON follows
  REFERENCING NEW TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION maintain_user_follow_counts();
--> statement-breakpoint
CREATE TRIGGER follows_count_after_delete
  AFTER DELETE ON follows
  REFERENCING OLD TABLE AS changed_rows
  FOR EACH STATEMENT EXECUTE FUNCTION maintain_user_follow_counts();
--> statement-breakpoint

-- PART 2: replies go one level deep
--
-- A CHECK constraint can only look at the row being written. "The parent must itself be a
-- top-level comment" needs to read another row, so it's a BEFORE INSERT trigger. It raises the
-- same error code as a CHECK constraint (23514), with a constraint name the API can recognise.
-- Comments can't be edited, so parent_id never changes after insert.
CREATE FUNCTION enforce_comment_reply_depth() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM comments WHERE id = NEW.parent_id AND parent_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A reply must answer a top-level comment, not another reply'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'comments_one_reply_level';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER comments_one_reply_level
  BEFORE INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION enforce_comment_reply_depth();
