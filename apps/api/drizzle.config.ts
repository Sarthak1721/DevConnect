import { defineConfig } from 'drizzle-kit';

// drizzle-kit is the command-line half of Drizzle: it compares src/db/schema with the snapshots in
// src/db/migrations/meta and writes the SQL needed to get from one to the other.
//
// `pnpm db:generate` needs no database. Commands that connect (e.g. `drizzle-kit studio`) read
// DATABASE_URL from apps/api/.env.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file (e.g. in CI): fall back to the environment / the default below.
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://devconnect:devconnect@127.0.0.1:5432/devconnect',
  },
  // Ask before ambiguous changes (rename or drop + add?) and print every statement.
  strict: true,
  verbose: true,
});
