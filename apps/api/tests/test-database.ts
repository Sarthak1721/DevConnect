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
