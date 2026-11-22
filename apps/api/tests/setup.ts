import { afterAll } from 'vitest';
import { closeDatabase } from '../src/db/client';

// Runs inside every integration test file. Each file gets its own copy of the modules, and with it
// its own connection pool: close it when the file is done so the test process can exit cleanly.
afterAll(async () => {
  await closeDatabase();
});
