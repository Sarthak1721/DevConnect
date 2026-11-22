import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';

/** Folder with the SQL migrations drizzle-kit generates (and the custom ones we write). */
export const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

/**
 * Applies every migration not applied yet, in order, inside one transaction: either all pending
 * migrations succeed or the database is left exactly as it was.
 *
 * Drizzle records applied migrations in the table drizzle.__drizzle_migrations, so running this
 * twice is safe: the second run finds nothing to do.
 *
 * Kept free of env/logger imports so test setup can call it with its own connection.
 */
export async function runMigrations(
  db: NodePgDatabase,
): Promise<{ applied: number; total: number }> {
  const before = await countAppliedMigrations(db);
  await migrate(db, { migrationsFolder });
  const total = await countAppliedMigrations(db);
  return { applied: total - before, total };
}

async function countAppliedMigrations(db: NodePgDatabase): Promise<number> {
  // Two queries, not one: Postgres resolves every table name while parsing, before running
  // anything, so even `CASE WHEN <table missing> THEN 0 ELSE (SELECT ... FROM table)` fails on the
  // first run. to_regclass() returns NULL instead of failing when the table doesn't exist.
  const exists = await db.execute<{ table: string | null }>(
    sql`SELECT to_regclass('drizzle.__drizzle_migrations')::text AS "table"`,
  );
  if (!exists.rows[0]?.table) return 0;

  const result = await db.execute<{ applied: number }>(
    sql`SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations`,
  );
  return result.rows[0]?.applied ?? 0;
}
