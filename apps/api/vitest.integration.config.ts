import { defineConfig } from 'vitest/config';
// With the file extension: Vite is moving to loading config files with Node's own TypeScript
// support, which doesn't guess extensions the way a bundler does.
import { testDatabaseUrl } from './tests/test-database.ts';

// Integration tests: real Express app + real PostgreSQL 18 (the devconnect_test database).
// Locally: `pnpm infra:up` first. In CI, Postgres runs as a service container.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    // Once per run: wipe the test database and apply all migrations.
    globalSetup: ['tests/global-setup.ts'],
    // In every test file: close that file's connection pool at the end.
    setupFiles: ['tests/setup.ts'],
    // All files share one database, so they run one after another, never at the same time.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      PORT: '4000',
      WEB_ORIGIN: 'http://localhost:3000',
      TRUST_PROXY_HOPS: '0',
      DATABASE_URL: testDatabaseUrl,
    },
    hookTimeout: 30_000,
  },
});
