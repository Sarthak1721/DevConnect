# 0003. PostgreSQL as the primary database

- Status: Accepted
- Date: 2026-10-10

## Context

DevConnect's data is a social graph: users follow users, users like posts, comments belong to posts
and authors. Several rules must be impossible to break: no duplicate likes, no duplicate follows,
no following yourself. The feed joins follows with posts, and search covers users and posts.

## Decision

Use **PostgreSQL 18** (Docker locally, a managed provider in production) as the single source of
truth.

## Consequences

- Foreign keys, unique constraints and CHECK constraints enforce the rules above inside the
  database, whatever code path writes the data.
- Joins, composite indexes and keyset pagination serve the feed efficiently.
- Built-in full-text search (`tsvector` + GIN) and trigram matching (`pg_trgm`) cover search without
  a separate search engine.
- JSONB still handles the few document-shaped fields (experience, education).
- Schema changes need migrations (see ADR 0005).

## Alternatives considered

- **MongoDB:** a good fit for self-contained documents with varying shapes. Here it would leave
  referential integrity to application code, and the feed and graph queries would rely on `$lookup`.
