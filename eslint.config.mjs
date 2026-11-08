// @ts-check
// One ESLint config for the whole monorepo (ESLint "flat config").
// Each block targets a set of files; later blocks add to earlier ones.
import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    'apps/web/.next/',
    'apps/web/next-env.d.ts',
  ]),

  // Plain JavaScript files (config files, build scripts) run in Node.js.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  // API + shared package: type-aware rules. These use the TypeScript compiler to catch bugs
  // a syntax-only linter can't see, e.g. a Promise that is never awaited (no-floating-promises).
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // `import type` for type-only imports (pairs with verbatimModuleSyntax in tsconfig).
      '@typescript-eslint/consistent-type-imports': 'error',
      // Allow intentionally unused parameters/variables when prefixed with "_".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  // Web app: Next.js's official rules (React, hooks, accessibility, Core Web Vitals).
  {
    files: ['apps/web/**/*.{js,jsx,mjs,ts,tsx}'],
    extends: [nextVitals, nextTs],
    settings: {
      next: { rootDir: 'apps/web/' },
      react: { version: '19.3' },
    },
  },
]);
