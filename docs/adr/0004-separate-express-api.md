# 0004. A separate Express API instead of Next.js API routes

- Status: Accepted
- Date: 2026-10-10

## Context

Next.js can host API endpoints (Route Handlers) next to the pages, which means one deployment.
DevConnect is also meant to demonstrate backend engineering: middleware, layering, connection
pooling and testing.

## Decision

Build the backend as a **separate Express 5 service** (`apps/api`) with a layered structure
(routes → controller → service → repository) and one ordered middleware pipeline.

## Consequences

- A long-running process keeps a steady database connection pool; no serverless cold starts.
- Cross-cutting concerns (security headers, request ids, rate limits, validation, errors) live in
  one explicit, testable pipeline. Supertest tests the app in memory without a port.
- The API is reusable by other clients (mobile, CLI) and deployable on its own.
- Cost: two deployments, and the browser talking to a second origin. ADR 0006 removes the
  cross-origin cookie problem with a same-origin proxy.

## Alternatives considered

- **Next.js Route Handlers:** simpler hosting, but backend and frontend become one unit, and
  serverless execution complicates database connections.
- **NestJS:** dependency-injection framework conventions hide the concepts this project is meant to
  teach.
- **Fastify:** a strong choice; Express is more widely known and raw framework speed is not the
  bottleneck here.
