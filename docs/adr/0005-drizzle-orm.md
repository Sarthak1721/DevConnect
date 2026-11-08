# 0005. Drizzle ORM with plain-SQL migrations

- Status: Accepted (implemented in Phase 2)
- Date: 2026-10-10

## Context

The API needs type-safe database access. Key queries (keyset pagination, full-text search, the
feed) must stay understandable as SQL, because that is what gets reviewed and asked about.

## Decision

Use **Drizzle ORM**'s SQL-like query builder with **drizzle-kit** generating plain SQL migration
files, on top of a `node-postgres` connection pool. Avoid Drizzle's Relational Query API, the part
that changes between Drizzle v0 and v1.

## Consequences

- Queries read like SQL and can print the SQL they generate; migrations are SQL files in Git.
- Result types are inferred from the TypeScript schema.
- Complex queries use the `sql` template while staying typed.
- Drizzle v1 is still in beta; pinning the stable line and avoiding the Relational Query API keeps
  the upgrade small.

## Alternatives considered

- **Prisma 7:** mature and popular, but its own query language hides SQL, and advanced queries drop
  to raw SQL anyway.
- **Raw `pg` queries:** maximum control, but no type inference and a lot of mapping boilerplate.
