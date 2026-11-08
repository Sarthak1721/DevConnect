# 0006. Token-based auth behind a same-origin API proxy

- Status: Accepted (proxy implemented in Phase 1, auth in Phase 3)
- Date: 2026-10-10

## Context

In production the web app (Vercel) and the API (Render) live on different sites. A cookie set by
the API would be a third-party cookie from the browser's point of view, and Safari blocks those by
default. We also need short-lived, revocable sessions that can't be stolen with an XSS bug that reads
storage.

## Decision

- The browser calls `/api/*` on the **web app's own origin**, and Next.js **rewrites** (proxies)
  those requests to the API (`apps/web/next.config.ts`). To the browser there is only one origin.
- **Access token:** a JWT valid for 15 minutes, kept in memory only (never `localStorage`), sent as
  `Authorization: Bearer`.
- **Refresh token:** an opaque random value in an `HttpOnly; Secure; SameSite=Strict` cookie scoped
  to `/api/v1/auth`, stored server-side only as a hash, rotated on every use, with reuse detection.
- The API marks every response `Cache-Control: no-store` unless a route opts in, because the CDN in
  front of the proxy caches whatever the API's headers allow.

## Consequences

- Cookies are first-party, and the browser needs no CORS for normal traffic.
- XSS cannot read the refresh token; a stolen access token expires within minutes.
- The API sees the proxy, not the user: `TRUST_PROXY_HOPS` must match the real number of proxies so
  rate limiting uses the true client IP (verified during deployment).
- Every request has one extra hop through the proxy.

## Alternatives considered

- **Calling the API cross-origin:** breaks refresh cookies on Safari; needs CORS with credentials.
- **Tokens in `localStorage`:** readable by any injected script.
- **A custom domain (`app.` + `api.`):** also first-party, but costs a domain and still needs CORS.
  Kept as an optional upgrade.
