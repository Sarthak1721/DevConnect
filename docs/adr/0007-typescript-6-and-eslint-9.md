# 0007. Pin TypeScript 6.0 and ESLint 9 for tooling compatibility

- Status: Accepted
- Date: 2026-10-10

## Context

Newer major versions exist: TypeScript 7 (the native, much faster compiler) and ESLint 10. But:

- `typescript-eslint` (8.71), which powers our type-aware lint rules such as `no-floating-promises`,
  supports TypeScript `>=4.8.4 <6.1.0`. Its rules call the TypeScript compiler's JavaScript API,
  which the TypeScript 7 native compiler does not provide in the same form.
- `eslint-config-next` 16.4 depends on `eslint-plugin-react`, `eslint-plugin-import` and
  `eslint-plugin-jsx-a11y`, which declare support for ESLint 9 at most. The official
  `create-next-app` template pins ESLint 9 for the same reason. ESLint 9 itself is now marked as no
  longer supported by the ESLint team.

## Decision

- **TypeScript `~6.0.3`** everywhere (via the pnpm catalog). The tilde keeps us below 6.1, the
  limit `typescript-eslint` supports.
- **ESLint `^9`**, matching the Next.js template.

## Consequences

- Type-aware linting and the Next.js lint rules work together, today.
- We miss TypeScript 7's faster type checking for now. Next.js 16.3+ can already use TypeScript 7
  for `next build`, so that part can be adopted early if build times ever matter.
- We are on an ESLint major that no longer gets fixes. Linting is a development-time tool, never
  shipped to users, so the risk is limited.
- Revisit when `typescript-eslint` supports TypeScript 7 and `eslint-config-next` supports ESLint 10.

## Alternatives considered

- **TypeScript 7 now:** lose type-aware lint rules, which catch real async bugs in Express handlers.
- **ESLint 10 now:** the Next.js plugins have not declared support; they may break at runtime.
