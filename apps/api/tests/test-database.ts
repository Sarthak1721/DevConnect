/**
 * Integration tests use their own database: `devconnect_test`, created by
 * docker/postgres/init/01-create-test-database.sql locally and by the CI workflow in GitHub Actions.
 * Override with TEST_DATABASE_URL (e.g. if your Postgres runs on another port).
 */
export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://devconnect:devconnect@127.0.0.1:5432/devconnect_test';

/** The test setup deletes ALL data, so it only accepts databases whose name ends in "_test". */
export function assertIsTestDatabase(url: string): void {
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against the database "${name}": its name must end in ` +
        '"_test", because the tests delete all data in it.',
    );
  }
}

/** The URL with its password hidden, for error messages. */
export function redactUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.password) parsed.password = '***';
  return parsed.toString();
}

/**
 * Redis for integration tests: logical database 1 of the local Redis, so a test run (which empties
 * it) never touches the counters of your running dev server, which uses database 0.
 * Override with TEST_REDIS_URL.
 */
export const testRedisUrl = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/1';

/** The tests empty their Redis database, so they refuse database 0 (the dev server's). */
export function assertIsTestRedis(url: string): void {
  const database = new URL(url).pathname.slice(1) || '0';
  if (database === '0') {
    throw new Error(
      `Refusing to run integration tests against Redis database 0 (${url}): the tests delete ` +
        'everything in their database. Use another one, e.g. redis://127.0.0.1:6379/1.',
    );
  }
}
