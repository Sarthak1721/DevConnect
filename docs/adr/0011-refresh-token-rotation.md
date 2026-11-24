# 0011. Rotating refresh tokens with reuse detection, revoked per session

- Status: Accepted
- Date: 2026-11-24

## Context

ADR 0006 chose short-lived JWT access tokens (15 minutes, in memory) plus a long-lived refresh
token in an HttpOnly cookie. That leaves the refresh token as the valuable target: whoever holds it
can mint access tokens for days. We need to:

1. limit the damage if a refresh token is copied (malware, a leaked backup, a shared computer);
2. let users end a session (logout) and every session (logout everywhere), immediately;
3. not log people out by accident when two browser tabs refresh at the same moment, or when a
   refresh response gets lost on a bad network.

## Decision

**Opaque, hashed, single-use tokens.** A refresh token is 32 random bytes (base64url, 43
characters). The database stores only its SHA-256 (`refresh_tokens.token_hash`). A fast hash is
enough: guessing a 256-bit random value succeeds with probability 2⁻²⁵⁶ per try.

**Families.** A login starts a family (`family_id`, also the `sid` claim of every access token it
issues). Each refresh claims the presented token (sets `rotated_at`) and inserts its successor in
the same family, in one transaction. The claim is one `UPDATE … WHERE rotated_at IS NULL …
RETURNING`, so of several concurrent requests with the same token exactly one wins.

**Expiry.** Each new token lives `REFRESH_TOKEN_TTL_DAYS` (7) from its issue, so an active user stays
signed in; the family has a hard cap of 30 days (`family_expires_at`). Formally, for token _k_ of a
family started at time _t₀_ and refreshed at _tₖ_:

```
expires_at(k) = min(tₖ + 7 days, t₀ + 30 days)
```

**Reuse detection.** Presenting a token that was already rotated means two parties hold copies of
one token: the real user and someone else. We cannot tell which is which, so we revoke the whole
family and both must sign in again. The thief's access tokens expire within 15 minutes.

**Grace period: 10 seconds.** A token rotated less than 10 s ago gets a sibling token (same family)
instead of triggering reuse detection. This covers two tabs refreshing at once and a client
retrying after a lost response. The browser also serialises refreshes across tabs with the Web
Locks API, so the grace period is a safety net, not the main mechanism.

**Revocation belongs to the family, checked when a token is used.** A family counts as revoked as
soon as any of its tokens has `revoked_at` set:

```
revoked(f) ⇔ ∃ r ∈ refresh_tokens : r.family_id = f ∧ r.revoked_at IS NOT NULL
```

Every claim and every sibling insert checks this, through a partial index that holds only the
revoked tokens (`refresh_tokens_revoked_family_idx`, migration 0003). The reason is a race: under
PostgreSQL's default isolation (READ COMMITTED), the `UPDATE` that revokes "every token of the
family" sees only rows committed when it started. A successor inserted by a concurrent refresh is
invisible to it and would survive the logout, or survive the revocation that reuse detection just
performed. With the family-level check, that successor is dead on arrival.

**Cleanup.** At each login, the user's families past their 30-day cap are deleted (whole families,
never single rows: a revoked family's revoked rows are what keep its other tokens unusable).

## Consequences

- A stolen refresh token works at most until the next legitimate refresh, and using it then signs
  out the victim's session, which the victim notices (and the log shows `auth.refresh_token_reused`).
- Logout and "log out everywhere" take effect immediately for refresh tokens. Access tokens already
  issued stay valid until they expire (at most 15 minutes): the price of not querying the database
  on every request.
- One row per refresh: an active session adds ~96 rows a day (one per 15 minutes), up to ~2,900 at
  its 30-day cap. Cheap to store; the partial index keeps the revocation check at a couple of index
  pages however long the family grows (measured in docs/database.md, lesson 4).
- Within the 10-second grace window, a replayed token is not detected. An attacker would need the
  token and to use it within 10 seconds of the real user's refresh.
- The refresh endpoint needs the database (unlike access-token checks). That's one indexed lookup
  per user every ~15 minutes.

## Alternatives considered

| Option                                         | Revocable?     | Detects theft?         | Cost                                     |
| ---------------------------------------------- | -------------- | ---------------------- | ---------------------------------------- |
| One long-lived JWT, no refresh token           | No             | No                     | None                                     |
| Static refresh token (reused until it expires) | Yes            | No                     | One lookup per refresh                   |
| **Rotation + reuse detection (chosen)**        | Yes            | Yes, after the fact    | One row per refresh                      |
| Server-side sessions only (no JWT)             | Yes, instantly | No                     | A lookup on every request                |
| Sender-constrained tokens (DPoP, RFC 9449)     | Yes            | Prevents use of copies | Key pair in the browser, more complexity |

- **Revoking token rows instead of families**: simpler to state, but loses the race described above.
- **A separate `sessions` table** (one row per family, holding `revoked_at`): the cleaner model if
  sessions get more state later (a device name, a list of active sessions to manage). Possible as an
  "expand, then contract" migration; not needed yet.
- **No grace period**: correct in theory, but double refreshes happen in practice (tabs, retries),
  and each would sign the user out.
