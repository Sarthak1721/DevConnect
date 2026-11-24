import { defineConfig } from 'vitest/config';

// Unit tests: fast, no database, no network. They live next to the code (src/**/*.test.ts).
// Integration tests (tests/integration, real Postgres) have their own config:
// vitest.integration.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Tests get a fixed, known environment. They never read your local .env file,
    // so they behave the same on your machine and in CI.
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      PORT: '4000',
      WEB_ORIGIN: 'http://localhost:3000',
      TRUST_PROXY_HOPS: '0',
      // Required by the env schema. Unit tests never connect: the pool only connects on a query,
      // and nothing calls connectRedis() (Redis commands fail fast, so the rate limiter lets
      // requests through).
      DATABASE_URL: 'postgresql://devconnect:devconnect@127.0.0.1:5432/devconnect_test',
      REDIS_URL: 'redis://127.0.0.1:6379/1',
      // A fixed, public value: fine for tests, never valid anywhere else.
      JWT_ACCESS_SECRET: 'unit-tests-only-not-a-real-secret-0123456789abcdef',
    },
  },
});
