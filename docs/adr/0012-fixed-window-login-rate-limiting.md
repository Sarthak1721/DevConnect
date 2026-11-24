# 0012. Fixed-window rate limiting in Redis for login and sign-up, failing open

- Status: Accepted (to be replaced by a token bucket in Phase 12)
- Date: 2026-11-24

## Context

Login is where attackers guess passwords: against one account (brute force), or with leaked email
and password pairs against many accounts (credential stuffing). Each attempt also costs us a full
Argon2id computation (19 MiB of memory, tens of milliseconds of CPU), so a flood of attempts is also
a cheap way to overload the API. Sign-up has the same cost per request.

Limits must hold across every API instance, so the counters can't live in process memory.

## Decision

A **fixed-window counter** per (rule, key, window) in Redis. With window length _W_, limit _L_ and
the current time _t_, the window number is _n_ = ⌊_t_ / _W_⌋ and a request is allowed if the
counter, after counting it, is at most _L_:

```
allow  ⇔  INCR rl:<rule>:<key>:<n>  ≤  L
```

| Rule            | Key                  | Limit (L) | Window (W) | Protects against                     |
| --------------- | -------------------- | --------- | ---------- | ------------------------------------ |
| `login-account` | SHA-256 of the email | 10        | 15 minutes | guessing one account's password      |
| `login-ip`      | client IP            | 50        | 15 minutes | one machine trying many accounts     |
| `register-ip`   | client IP            | 10        | 1 hour     | mass sign-ups (each costs an Argon2) |

Both login rules count every attempt, before the password is checked. A refused request gets
**429 RATE_LIMITED** with `Retry-After` (seconds until the window ends).

**Atomicity without a script.** `INCR` is atomic, so concurrent requests on different API instances
each get a distinct count. `EXPIRE key W NX` (set an expiry only if none exists) is sent with every
increment, so a lost `EXPIRE` is repaired by the next request; and because _n_ is part of the key,
an old window's counter is never reused even if its expiry were missing.

**Fail open.** If Redis is unreachable or slow (500 ms command timeout; the client rejects commands
at once while disconnected), the request goes through and a warning is logged at most once a
minute. Readiness reports `degraded` instead of failing.

## Consequences

- Online guessing against one account is capped at 10 tries per 15 minutes, about 960 a day: no
  threat to a 15+ character password that passes the guessability rules.
- **Boundary bursts:** a client can send _L_ requests at the end of window _n_ and _L_ more at the
  start of _n_ + 1, so up to 2_L_ in a few seconds. Phase 12 replaces this with a token bucket,
  which has no window edges.
- **Targeted lockout:** anyone who knows your email can use up its 10 attempts and keep you from
  signing in for up to 15 minutes. That's the classic cost of per-account limits; the short window
  keeps it small.
- **Shared IPs:** a campus or office network shows up as one IP; the per-IP limit is generous for
  that reason. IPv6 users can rotate addresses inside their /64 network, which the per-IP rule
  doesn't group yet (Phase 12).
- Behind proxies, `req.ip` is only the real client if `TRUST_PROXY_HOPS` matches the number of
  proxies. That is checked during the deployment smoke test.
- While Redis is down, there is no throttling at all (Argon2 still makes each guess expensive).

## Alternatives considered

| Algorithm                 | State per key      | Accuracy                      | Atomic update needs  |
| ------------------------- | ------------------ | ----------------------------- | -------------------- |
| **Fixed window (chosen)** | 1 counter          | up to 2L around a boundary    | `INCR` alone         |
| Sliding log               | up to L timestamps | exact                         | a transaction/script |
| Sliding window counter    | 2 counters         | approximate, smooth           | a script             |
| Token bucket (Phase 12)   | tokens + timestamp | bursts ≤ capacity, exact rate | a script             |

- **In-process counters** (e.g. a `Map`): free, but each API instance counts separately, and a
  restart forgets everything.
- **Fail closed** (refuse logins while Redis is down): stricter, but a cache outage would become a
  login outage. For a portfolio app, availability wins; a bank might decide the other way.
- **Locking the account after N failures**: turns every attacker into a denial-of-service tool
  against their victims. Throttling slows them down without locking anyone out for long.
