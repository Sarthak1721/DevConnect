# 0010. Denormalized counters maintained by statement-level triggers

- Status: Accepted
- Date: 2026-11-08

## Context

Five numbers appear on almost every screen: a post's like and comment counts, and a user's post,
follower and following counts. Counting rows on every read (`COUNT(*)` per post card) costs work
proportional to the number of likes, on every request. Storing the numbers is fast to read, but
they must stay exactly right, including when rows disappear through `ON DELETE CASCADE`, which
application code never sees (deleting a user deletes their likes on everyone else's posts).

## Decision

Store the counters as columns and let Postgres maintain them:

- `AFTER INSERT` and `AFTER DELETE` triggers, `FOR EACH STATEMENT`, with transition tables
  (`REFERENCING NEW/OLD TABLE AS changed_rows`). Each statement applies one aggregated update per
  parent row, however many rows it inserted or deleted.
- Before updating, the trigger locks the parent rows in primary-key order (`FOR NO KEY UPDATE`), so
  concurrent counter updates always lock in the same order and can't deadlock each other.
- `CHECK (count >= 0)` on every counter, so drift shows up as an error instead of a silently wrong
  number. `findCounterDrift()` recomputes every counter for tests, seeds and audits.
- Repeat-safe likes and follows use `INSERT ... ON CONFLICT DO NOTHING`: a repeated like inserts
  nothing, so the trigger sees no rows and the count doesn't move.

The invariant, for every post p:

```
like_count(p) = |{ l ∈ post_likes : l.post_id = p }|
```

If it holds before a statement that inserts the like rows I and deletes the like rows D, the trigger
sets `like_count'(p) = like_count(p) + |I_p| − |D_p|`, so it holds afterwards too. By induction over
statements, starting from 0 = 0 for a new post, it always holds.

## Consequences

- Reading a counter is a column read.
- Every like also updates its post's row. Concurrent likes on one post wait for each other on that
  row (a "hot row"); fine at our scale. The fix at very large scale: split each counter into N rows
  and add them up on read, or aggregate asynchronously.
- Bulk operations stay fast: the large-dataset generator inserts millions of likes with the triggers
  on.
- `TRUNCATE` skips triggers. We only use it to empty every table at once (tests, seeds).
- A rare deadlock remains possible when a statement already holds a parent row's lock before the
  trigger runs (e.g. deleting two users who follow each other, at the same moment). Postgres
  detects it within a second and cancels one transaction with error 40P01, which can be retried.
- The API never writes counter columns.

## Alternatives considered

| Option                                    | Reads                | Writes                         | Correct under cascades and races?            |
| ----------------------------------------- | -------------------- | ------------------------------ | -------------------------------------------- |
| `COUNT(*)` when reading                   | Slower as data grows | Free                           | Yes                                          |
| API increments the counter                | Fast                 | One extra query                | No: misses cascades; read-modify-write races |
| Row-level triggers                        | Fast                 | One update per changed row     | Yes, but bulk operations are slow            |
| **Statement-level triggers (chosen)**     | Fast                 | One update per affected parent | Yes                                          |
| Async aggregation (queue or periodic job) | Fast                 | Cheap                          | Eventually: counts lag behind                |
