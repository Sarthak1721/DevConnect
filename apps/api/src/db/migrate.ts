// `pnpm db:migrate`: brings the database in DATABASE_URL up to date with src/db/migrations.
//
// In production this runs as its own step BEFORE the new API version starts (Phase 16), so every
// migration must also work with the code that is still running ("expand -> migrate -> contract").
import { logger } from '../lib/logger';
import { createDatabase } from './client';
import { runMigrations } from './migrator';

// No statement timeout: building an index on a big table may legitimately take minutes.
const { pool, db } = createDatabase({ maxConnections: 1, statementTimeoutMs: 0 });

try {
  const { applied, total } = await runMigrations(db);
  logger.info(
    applied === 0
      ? `Database is up to date (${total} migrations applied).`
      : `Applied ${applied} new migration(s); ${total} in total.`,
  );
} catch (error) {
  logger.fatal({ err: error }, 'Migration failed; nothing was changed (it runs in a transaction).');
  process.exitCode = 1;
} finally {
  await pool.end();
}
