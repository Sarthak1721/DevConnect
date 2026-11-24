import { afterAll, beforeAll } from 'vitest';
import { closeDatabase } from '../src/db/client';
import { closeRedis, redis } from '../src/lib/redis';

// Runs inside every integration test file. Each file gets its own copy of the modules, and with it
// its own connection pool and Redis client.
beforeAll(async () => {
  // In the API, server.ts connects Redis in the background; tests need it connected up front.
  await redis.connect();
});

// Close both connections when the file is done, so the test process can exit cleanly.
afterAll(async () => {
  await Promise.all([closeDatabase(), closeRedis()]);
});
