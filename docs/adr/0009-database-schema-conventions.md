# 0009. Database schema conventions: integrity enforced by Postgres

- Status: Accepted
- Date: 2026-11-08

## Context

Phase 0 designed the tables (users, profiles, skills, follows, posts, likes, comments, GitHub
snapshots, refresh tokens). Implementing them needs conventions that every table follows, and a
decision about where rules such as "no duplicate likes" or "replies go one level deep" live: in the
API, in the database, or both.

## Decision

1. **Keys:** `uuid DEFAULT uuidv7()` (built into Postgres 18). Pure link tables (`follows`,
   `post_likes`, `user_skills`) use a composite primary key, which doubles as the rule "no
   duplicates".
2. **Timestamps:** `timestamptz(3)`, an exact UTC instant with millisecond precision. `updated_at` is
   set by Drizzle (`$onUpdate`) instead of a trigger, because the counter triggers (ADR 0010) also
   update `users` and `posts`, and a new like must not change a post's `updated_at`.
3. **Text and enumerations:** `text` with a named `CHECK (char_length(...) ...)` instead of
   `varchar(n)`, and `text` + `CHECK (x IN (...))` instead of Postgres enum types.
4. **The database enforces every invariant.** `NOT NULL`, foreign keys with `ON DELETE CASCADE`,
   `UNIQUE` and `CHECK`. The API validates first so users get friendly messages; the database
   guarantees the rule for every code path (future endpoints, scripts, manual SQL). Rules that
   involve another row use the strongest tool available:
   - a reply belongs to the same post as its parent: the composite foreign key
     `(parent_id, post_id) → comments (id, post_id)`;
   - replies go one level deep: a `BEFORE INSERT` trigger that raises the same error code as a
     `CHECK` (23514), with a constraint name the API can recognise.
5. **Case-insensitive email:** stored in lower case (`CHECK (email = lower(email))`) with a plain
   unique index, instead of the `citext` extension or a `lower(email)` expression index.
6. **Indexes:** the Phase 0 plan, with two corrections found while implementing it:
   - `DESC` index columns are created as `DESC NULLS FIRST`, matching what `ORDER BY ... DESC`
     means in Postgres. Drizzle's `.desc()` alone writes `NULLS LAST`, and a measurement showed the
     planner then sorting the whole table instead of reading the index (docs/database.md).
   - `comments (post_id, created_at, id)` is a full index, not partial (`WHERE parent_id IS NULL`):
     deleting a post must also find the replies, and a partial index can't serve that lookup.
7. **Migrations:** drizzle-kit generates DDL from the TypeScript schema; hand-written SQL migrations
   cover what it can't express (extensions, triggers). All pending migrations apply in one
   transaction. CI fails when the schema and the migrations disagree.

## Consequences

- Invalid data can't get in, whichever code writes it, and the tests prove each rule at the
  database level (`tests/integration/constraints.test.ts`).
- Every constraint has a stable name, so Phase 3 can map `users_email_key` to `409 EMAIL_TAKEN`.
- Changing a rule (a longer bio, a new sync status) needs a migration. That's deliberate: rules
  change in reviewed code, not silently.
- Each index and constraint adds work to every write. Indexes exist only for a query that needs them.
- Rows are deleted for real (cascades), not soft-deleted with a `deleted_at` column.

## Alternatives considered

- **Sequential integer ids:** smaller and fast, but guessable (`/posts/1`, `/posts/2`, ...) and they
  leak how many rows exist.
- **UUIDv4 ids:** unguessable, but random, so each insert lands on a random index page.
- **`varchar(n)`:** no faster than `text` in Postgres, and a `CHECK` can express a range (1–50) with
  a name the error message carries.
- **Postgres enums:** compact, but values can't be removed or renamed easily.
- **`citext`:** an extension whose comparisons depend on collation; storing lower-case is explicit.
- **Validation only in the API:** one forgotten check in one endpoint corrupts data permanently.
- **Soft deletes:** keeps history, but every query must remember `WHERE deleted_at IS NULL`, and
  unique constraints and cascades get harder.
