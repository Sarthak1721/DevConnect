# API reference

Base URL: `/api/v1`. Locally the API listens on <http://localhost:4000>; the web app forwards
`http://localhost:3000/api/*` to it, so browsers use the web app's address.

## Conventions

**Response envelope.** Every response body has one of two shapes (schemas in
`packages/shared/src/api.ts`):

```jsonc
// success
{ "success": true, "data": { ... } }

// failure
{
  "success": false,
  "message": "Human-readable explanation",
  "error": { "code": "MACHINE_READABLE_CODE", "details": [ ... ], "requestId": "…" }
}
```

`requestId` matches the `X-Request-Id` response header and the server log line of that request.

**Error codes** (`packages/shared/src/errors.ts`):

| Code                            | Status | Meaning                                                                  |
| ------------------------------- | ------ | ------------------------------------------------------------------------ |
| `VALIDATION_ERROR`              | 400    | The body failed validation; `details` is `[{ path, message }]` per field |
| `UNAUTHENTICATED`               | 401    | No valid credentials (missing token, invalid token, ended session)       |
| `TOKEN_EXPIRED`                 | 401    | The access token expired: refresh it and retry                           |
| `INVALID_CREDENTIALS`           | 401    | Wrong email or password (deliberately not saying which)                  |
| `FORBIDDEN`                     | 403    | Not allowed, e.g. a cookie request from another origin                   |
| `NOT_FOUND`                     | 404    | No such route or resource                                                |
| `EMAIL_TAKEN`, `USERNAME_TAKEN` | 409    | Already registered; `details` names the field                            |
| `PAYLOAD_TOO_LARGE`             | 413    | Body over 100 kB                                                         |
| `RATE_LIMITED`                  | 429    | Too many attempts; see the `Retry-After` header (seconds)                |
| `INTERNAL_ERROR`                | 500    | A bug; the response never includes internals                             |
| `SERVICE_UNAVAILABLE`           | 503    | The database is unreachable                                              |

**Authentication.** Protected endpoints need `Authorization: Bearer <accessToken>`. A 401 carries a
`WWW-Authenticate: Bearer …` header (RFC 6750). The refresh token travels only in the `dc_rt`
cookie. How it all fits together: [auth.md](auth.md).

**CSRF rule.** Endpoints that set or read the `dc_rt` cookie (register, login, refresh, logout)
require an `Origin` header equal to the web app's origin (`WEB_ORIGIN`). Browsers send it
automatically; with curl, add `-H "Origin: http://localhost:3000"`.

**Caching.** Every response is `Cache-Control: no-store` unless an endpoint says otherwise.

## Health

### `GET /health` (liveness)

`200 { status: "ok", uptimeSeconds, timestamp }`. Touches no database: "the process is up".

### `GET /health/ready` (readiness)

| Situation             | Status | Body                                                                                                         |
| --------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| Database and Redis up | 200    | `{ status: "ready", checks: { database: { status: "up", latencyMs }, redis: { status: "up", latencyMs } } }` |
| Redis down            | 200    | `status: "degraded"`, `checks.redis: { status: "down" }` (the API works; rate limiting is off)               |
| Database down         | 503    | `SERVICE_UNAVAILABLE`, `details: { database: "down", redis: "up" \| "down" }`                                |

## Auth

All under `/api/v1/auth`. The session responses share one shape (`authSessionSchema`):

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "01a20c33-66e7-74d7-a3ee-78d0d4d25f6a",
      "username": "ada",
      "name": "Ada Lovelace",
      "email": "ada@example.com",
      "avatarUrl": null
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6ImF0K2p3dCJ9…",
    "expiresIn": 900
  }
}
```

…plus two cookies: `dc_rt` (the refresh token; HttpOnly, Secure, SameSite=Strict,
Path=/api/v1/auth) and `dc_has_session=1` (readable by JavaScript, no secret, Path=/).

### `POST /auth/register`

Credential: none (Origin required). Rate limit: 10 per hour per IP.

```json
{
  "name": "Ada Lovelace",
  "username": "ada",
  "email": "ada@example.com",
  "password": "analytical engine notes 1843"
}
```

| Field      | Rules (shared Zod schema)                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `name`     | trimmed; 1–50 characters; no line breaks or control characters                                                                       |
| `username` | trimmed and lower-cased; 3–30 characters of `a-z`, `0-9` and single hyphens, not at either end; not reserved (`admin`, `support`, …) |
| `email`    | trimmed and lower-cased; valid address; at most 254 characters                                                                       |
| `password` | 15–128 characters (code points); not too easy to guess, nor built from the other fields                                              |

| Response                             | When                                                  |
| ------------------------------------ | ----------------------------------------------------- |
| `201` session + cookies              | account, profile and first session created            |
| `400 VALIDATION_ERROR`               | `details`: one `{ path, message }` per invalid field  |
| `403 FORBIDDEN`                      | missing or foreign `Origin`                           |
| `409 EMAIL_TAKEN` / `USERNAME_TAKEN` | `details: [{ path: "email" \| "username", message }]` |
| `429 RATE_LIMITED`                   | too many sign-ups from this IP                        |

### `POST /auth/login`

Credential: none (Origin required). Rate limits: 10 per 15 minutes per account, 50 per IP.

```json
{ "email": "ada@example.com", "password": "analytical engine notes 1843" }
```

| Response                  | When                                                           |
| ------------------------- | -------------------------------------------------------------- |
| `200` session + cookies   | correct email and password                                     |
| `400 VALIDATION_ERROR`    | missing or malformed fields                                    |
| `401 INVALID_CREDENTIALS` | wrong password **or** unknown email: same message, same timing |
| `403 FORBIDDEN`           | missing or foreign `Origin`                                    |
| `429 RATE_LIMITED`        | over a limit; `Retry-After` says when to retry                 |

### `POST /auth/refresh`

Credential: the `dc_rt` cookie (Origin required). Body: none.

| Response                                | When                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `200` session + new cookies             | the token was valid: it is now used up and replaced (rotation)                                                                |
| `200` session + new cookies             | the token was rotated less than 10 s ago (two tabs, a retry): a sibling token is issued                                       |
| `401 UNAUTHENTICATED` + cookies deleted | no cookie, unknown or expired token, ended session, or **reuse** of an old token (which also ends the session it belonged to) |
| `403 FORBIDDEN`                         | missing or foreign `Origin`                                                                                                   |

### `POST /auth/logout`

Credential: the `dc_rt` cookie (Origin required). Ends this session (every token of its family) and
deletes the cookies. Always `204`, also without a cookie (logging out twice is fine).

### `POST /auth/logout-all`

Credential: access token. Ends every session of the user on every device; deletes this browser's
cookies. `204`, or `401` without a valid access token. Access tokens already issued stay valid until
they expire (at most 15 minutes).

### `GET /auth/me`

Credential: access token. `200 { user }` (same user shape as above), or `401`.

## Trying it from a terminal

The browser handles cookies and headers for you; from a terminal you set them yourself. PowerShell
(Windows) example, against the API directly:

```powershell
$api = 'http://localhost:4000/api/v1/auth'
$origin = @{ Origin = 'http://localhost:3000' }

# Sign in as a seeded account (pnpm db:seed) and keep the response
$login = Invoke-WebRequest -Method Post -Uri "$api/login" -Headers $origin -ContentType 'application/json' `
  -Body '{"email":"aarav-mehta@example.com","password":"seed-password-for-local-dev"}'
$token = ($login.Content | ConvertFrom-Json).data.accessToken

# Use the access token
Invoke-RestMethod -Uri "$api/me" -Headers @{ Authorization = "Bearer $token" }
```
