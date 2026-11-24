import { createClient } from '@redis/client';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client, Pool } from 'pg';
import { runMigrations } from '../src/db/migrator';
import {
  assertIsTestDatabase,
  assertIsTestRedis,
  redactUrl,
  testDatabaseUrl,
  testRedisUrl,
} from './test-database';

/**
 * Runs once, before any integration test file:
 *  1. refuses to touch a database whose name doesn't end in "_test" (protects your dev data);
 *  2. drops everything and applies every migration from scratch. Tests then always run against
 *     exactly the current migrations, and every test run also proves the migrations work on an
 *     empty database;
 *  3. checks that Redis answers, so a missing Redis fails here with a clear message.
 *
 * Runs outside the test workers, so it avoids src/config/env (it builds its own connections).
 */
export default async function setup(): Promise<void> {
  assertIsTestDatabase(testDatabaseUrl);
  assertIsTestRedis(testRedisUrl);
  await checkRedis();

  const client = new Client({ connectionString: testDatabaseUrl });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Cannot connect to the test database at ${redactUrl(testDatabaseUrl)}. ` +
        'Is Postgres running? Locally: start Docker Desktop, then `pnpm infra:up`.',
      { cause: error },
    );
  }
  try {
    await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }

  const pool = new Pool({ connectionString: testDatabaseUrl, max: 1 });
  try {
    await runMigrations(drizzle(pool));
  } finally {
    await pool.end();
  }
}

async function checkRedis(): Promise<void> {
  // No reconnecting here: if Redis isn't there, fail at once instead of retrying forever.
  const redis = createClient({ url: testRedisUrl, socket: { reconnectStrategy: false } });
  redis.on('error', () => {}); // reported by the rejected connect() below
  try {
    await redis.connect();
  } catch (error) {
    throw new Error(
      `Cannot connect to Redis at ${redactUrl(testRedisUrl)}. ` +
        'Is it running? Locally: start Docker Desktop, then `pnpm infra:up`.',
      { cause: error },
    );
  }
  redis.destroy();
}
