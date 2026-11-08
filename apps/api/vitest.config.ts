import { defineConfig } from 'vitest/config';

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
    },
  },
});
