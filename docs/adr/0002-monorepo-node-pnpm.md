# 0002. One monorepo: Node.js 24 LTS + pnpm 12 workspaces

- Status: Accepted
- Date: 2026-10-10

## Context

DevConnect has a web app and an API that must agree on request/response shapes. Keeping them in
separate repositories means duplicating types and coordinating changes across two pull requests.

## Decision

- One Git repository with **pnpm workspaces**: `apps/web`, `apps/api`, `packages/shared`.
- `packages/shared` is an internal package published as **TypeScript source** (no build step).
  Next.js/Turbopack, tsx, Vitest and esbuild all compile it where it is used.
- **Node.js 24 LTS** as the runtime (`.nvmrc`, `engines`). Node 26 becomes LTS in late October
  2026; upgrading is optional and will get its own ADR.
- **pnpm 12**, pinned through `packageManager` in `package.json`, with:
  - a **catalog** in `pnpm-workspace.yaml` for versions shared by several packages;
  - `allowBuilds`: dependencies may only run install scripts we explicitly allow;
  - `minimumReleaseAge: 1440`: versions younger than 24 hours are not installed.

## Consequences

- One `git clone`, one install, one CI pipeline; frontend and backend changes land atomically.
- Shared Zod schemas give compile-time and runtime agreement between web and API.
- The supply-chain settings block install scripts and brand-new releases, which are the two most
  common routes for malicious npm packages. Occasionally a just-published version must wait a day.
- Contributors need pnpm, not npm.

## Alternatives considered

- **Two repositories:** duplicated types, two CI setups, harder to keep in sync.
- **npm workspaces:** works, but no catalogs, no build-script allowlist, and a looser
  `node_modules` layout that lets code import packages it never declared.
- **Turborepo / Nx:** task caching is valuable for large monorepos; with three packages it adds a
  tool without a measurable benefit yet.
