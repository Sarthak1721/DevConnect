# DevConnect

A developer social and portfolio platform: profiles, verified GitHub projects, posts, follows and a
personalized feed. Built phase by phase as a production-style full-stack project.

> **Status:** Phase 1 of 19 (project setup). See the [roadmap](#roadmap).

## Tech stack

| Layer   | Technology                                                            |
| ------- | --------------------------------------------------------------------- |
| Web     | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4        |
| API     | Node.js 24, Express 5, TypeScript, Zod 4, pino                        |
| Data    | PostgreSQL 18, Redis 8 (run locally with Docker Compose)              |
| Tooling | pnpm 12 workspaces, ESLint 9, Prettier, Vitest 5, GitHub Actions (CI) |

## Repository layout

```
apps/
  api/          Express REST API      → http://localhost:4000/api/v1
  web/          Next.js web app       → http://localhost:3000 (forwards /api/* to the API)
packages/
  shared/       Zod schemas + TypeScript types used by both apps
docker/         Init scripts for the local Postgres container
docs/adr/       Architecture Decision Records: why the project is built the way it is
```

## Getting started

### 1. Prerequisites

| Tool           | Version                       | How to install (Windows)                                                                                                                             |
| -------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js        | 24 LTS (see `.nvmrc`)         | [nodejs.org/en/download](https://nodejs.org/en/download): choose **v24** in the version menu (the site now defaults to 26), Windows Installer (.msi) |
| pnpm           | 12 (pinned in `package.json`) | `npm install --global pnpm@12`, then pnpm switches to the exact pinned version itself                                                                |
| Docker Desktop | Recent, WSL 2 backend         | [docker.com](https://www.docker.com/products/docker-desktop/)                                                                                        |
| Git            | Recent                        | [git-scm.com](https://git-scm.com)                                                                                                                   |

Two Windows details before you check:

- `npm` and `pnpm` start through small PowerShell scripts, which Windows blocks by default. Allow
  scripts for your own account once (no admin needed):
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- After installing Node.js or pnpm, open a **new** terminal. A terminal reads `PATH` (the list of
  folders it searches for programs) only when it starts.

Check your setup:

```powershell
node -v                 # v24.x
pnpm -v                 # 12.x
docker compose version  # prints a version, so Docker Desktop is running
```

### 2. Install dependencies

```powershell
pnpm install
```

### 3. Create your local environment files

These copies are git-ignored, so they never reach GitHub.

```powershell
# Windows (PowerShell)
Copy-Item apps\api\.env.example apps\api\.env
Copy-Item apps\web\.env.example apps\web\.env.local
```

```bash
# macOS / Linux
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

### 4. Start PostgreSQL and Redis

```powershell
pnpm infra:up       # starts both containers and waits until they report healthy
```

### 5. Run the apps

```powershell
pnpm dev            # API on :4000 and web app on :3000, with hot reload
```

Open <http://localhost:3000>. A green **API online** badge means the browser reached the API
through the Next.js proxy.

## Scripts

Run from the repository root.

| Command            | What it does                                                             |
| ------------------ | ------------------------------------------------------------------------ |
| `pnpm dev`         | Start API and web app together (`dev:api` / `dev:web` for just one)      |
| `pnpm build`       | Production builds: API bundle (`apps/api/dist`) and Next.js app          |
| `pnpm check`       | Everything CI checks except the build: format, lint, types, tests        |
| `pnpm lint`        | ESLint across the whole repo (`pnpm lint:fix` to auto-fix)               |
| `pnpm format`      | Format every file with Prettier (`format:check` only reports)            |
| `pnpm typecheck`   | TypeScript type checking in every package                                |
| `pnpm test`        | Run all tests once (`pnpm --filter @devconnect/api test:watch` to watch) |
| `pnpm audit`       | Check every dependency against published security advisories             |
| `pnpm infra:up`    | Start Postgres + Redis containers                                        |
| `pnpm infra:down`  | Stop them (data is kept)                                                 |
| `pnpm infra:reset` | Stop them and delete the database volume                                 |
| `pnpm infra:logs`  | Follow container logs                                                    |

## Troubleshooting

- **`pnpm` (or `node`) "is not recognized as the name of a cmdlet".** It isn't installed, or this
  terminal was opened before you installed it. Install it (see Prerequisites), then open a new
  terminal.
- **`npm` or `pnpm` is blocked ("running scripts is disabled on this system").** Allow locally
  created scripts once: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **Ctrl+C on Windows prints `Terminate batch job (Y/N)?`, `Failed` and
  `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`.** This is normal: the servers have stopped. Windows asks that
  question whenever Ctrl+C interrupts a script started through a `.cmd` file, and pnpm reports the
  interrupted scripts as failed. If the `PS D:\DevConnect>` prompt is already back, don't type an
  answer; you are back in PowerShell.
- **`next dev` offers to upgrade Next.js with a coding agent.** It found a security advisory for the
  installed version. Choose **Skip** (or wait 10 seconds), then upgrade deliberately: see
  [ADR 0008](docs/adr/0008-dependency-security-updates.md).
- **Port 5432 or 6379 is already in use** (for example by a locally installed PostgreSQL). Create a
  `.env` file in the repository root with `POSTGRES_PORT=5433` (or `REDIS_PORT=6380`); Docker Compose
  reads it. Use the same port in `DATABASE_URL` from Phase 2 onwards.
- **`pnpm infra:up` fails to connect to Docker.** Start Docker Desktop and wait until it says it is
  running.
- **Changed `docker/postgres/init/*.sql` but nothing happened.** Init scripts only run on an empty
  volume. Run `pnpm infra:reset`, then `pnpm infra:up`.
- **Git warns about CRLF line endings.** The repository enforces LF (`.gitattributes`). Run
  `git config --global core.autocrlf false` once.

## Documentation

- [Architecture Decision Records](docs/adr/README.md): the reasoning behind each major choice.

## Roadmap

- [x] Phase 0: Requirements and architecture
- [ ] Phase 1: Project setup ← in review
- [ ] Phase 2: Database design
- [ ] Phase 3: Authentication
- [ ] Phase 4: User profile
- [ ] Phase 5: GitHub integration
- [ ] Phase 6: Posts
- [ ] Phase 7: Comments and likes
- [ ] Phase 8: Follow system
- [ ] Phase 9: Personalized feed
- [ ] Phase 10: Image upload
- [ ] Phase 11: Search
- [ ] Phase 12: Security and rate limiting
- [ ] Phase 13: Testing
- [ ] Phase 14: Frontend polish
- [ ] Phase 15: Docker
- [ ] Phase 16: Deployment
- [ ] Phase 17: Monitoring and production hardening
- [ ] Phase 18: Documentation
- [ ] Phase 19: Resume and interview preparation
