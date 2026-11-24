import { defineConfig } from 'vitest/config';

// .mts = an ES module whatever package.json says (this package isn't "type": "module").
// Unit tests for the web app's plain TypeScript logic (src/**/*.test.ts), in Node: no browser and
// no React rendering. End-to-end tests in a real browser come in Phase 13 (Playwright).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
