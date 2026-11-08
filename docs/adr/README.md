# Architecture Decision Records

An ADR is a short note that records one significant decision: the situation, what we chose, and
what that choice costs us. Code shows _what_ the system does; ADRs keep _why_ it does it that way,
so nobody (including future you, in an interview) has to reverse-engineer the reasoning.

Rules: one decision per file, numbered in order, never rewritten. If a decision changes, write a
new ADR that supersedes the old one and update the old one's status.

| ADR                                           | Decision                                                    | Status   |
| --------------------------------------------- | ----------------------------------------------------------- | -------- |
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions as ADRs                       | Accepted |
| [0002](0002-monorepo-node-pnpm.md)            | One monorepo: Node.js 24 LTS + pnpm 12 workspaces           | Accepted |
| [0003](0003-postgresql.md)                    | PostgreSQL as the primary database                          | Accepted |
| [0004](0004-separate-express-api.md)          | A separate Express API instead of Next.js API routes        | Accepted |
| [0005](0005-drizzle-orm.md)                   | Drizzle ORM with plain-SQL migrations                       | Accepted |
| [0006](0006-auth-tokens-and-api-proxy.md)     | Token-based auth behind a same-origin API proxy             | Accepted |
| [0007](0007-typescript-6-and-eslint-9.md)     | Pin TypeScript 6.0 and ESLint 9 for tooling compatibility   | Accepted |
| [0008](0008-dependency-security-updates.md)   | Security updates: newest version that is patched and mature | Accepted |

## Template

```markdown
# NNNN. Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context

What problem or force makes a decision necessary?

## Decision

What we chose, stated plainly.

## Consequences

What gets easier, what gets harder, and what we must watch.

## Alternatives considered

Each option we rejected, and why.
```
