import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { AppError } from './errors';
import { logger } from './logger';
import { redis } from './redis';

/**
 * Fixed-window rate limiting in Redis (docs/adr/0012).
 *
 * Time is cut into windows of W seconds; window number n = ⌊t / W⌋. Each (rule, key, window) has
 * a counter, and a request is allowed while the counter is ≤ L. The counter lives in Redis, not
 * in memory, so every API instance shares it.
 *
 * Known weakness, on purpose (Phase 12 replaces this with a token bucket): a client can send L
 * requests at the very end of one window and L more at the start of the next, so up to 2L in a
 * short burst around the boundary.
 */

export type RateLimitRule = {
  /** Part of the Redis key; also shows up in logs. */
  name: string;
  /** L: requests allowed per window. */
  limit: number;
  /** W: window length in seconds. */
  windowSeconds: number;
};

export const RATE_LIMITS = {
  /** Brute force against one account. ~960 guesses a day at most, hopeless against 15+ characters. */
  loginPerAccount: { name: 'login-account', limit: 10, windowSeconds: 15 * 60 },
  /** One machine trying many accounts. Generous, because a campus or office shares one IP. */
  loginPerIp: { name: 'login-ip', limit: 50, windowSeconds: 15 * 60 },
  /** Mass sign-ups; each registration also costs an Argon2 hash. */
  registerPerIp: { name: 'register-ip', limit: 10, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;

export type RateLimitCheck = { rule: RateLimitRule; key: string };

/** The client's IP as Express sees it (correct only if TRUST_PROXY_HOPS matches reality). */
export function ipKey(req: Request): string {
  return `ip:${req.ip ?? 'unknown'}`;
}

/** Emails are personal data: Redis only ever sees their SHA-256. */
export function emailKey(email: string): string {
  return `email:${createHash('sha256').update(email).digest('hex')}`;
}

/**
 * Counts one request against every check, then throws 429 RATE_LIMITED if any is over its limit.
 *
 * Why no Lua script or transaction? INCR is atomic on its own: two API instances incrementing the
 * same counter at the same moment get 7 and 8, never both 7. EXPIRE ... NX ("only if the key has
 * no expiry yet") is safe to repeat on every request, so if one EXPIRE is lost the next request
 * sets it. And because the window number is part of the key, an old window's counter is never
 * reused, even if its expiry were missing.
 */
export async function enforceRateLimits(checks: RateLimitCheck[]): Promise<void> {
  const nowSeconds = Date.now() / 1000;

  let results: { rule: RateLimitRule; count: number; retryAfterSeconds: number }[];
  try {
    results = await Promise.all(checks.map((check) => hit(check, nowSeconds)));
  } catch (error) {
    // Fail OPEN: if Redis is down, let the request through. For this app, staying available
    // matters more than throttling for a few minutes; Argon2 still makes every guess expensive.
    // (Authentication itself always fails CLOSED: no valid token, no access.)
    warnRedisDown(error);
    return;
  }

  const exceeded = results.filter((result) => result.count > result.rule.limit);
  if (exceeded.length === 0) return;

  const retryAfterSeconds = Math.max(...exceeded.map((result) => result.retryAfterSeconds));
  throw new AppError(429, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.', {
    details: { retryAfterSeconds, rules: exceeded.map((result) => result.rule.name) },
    headers: { 'Retry-After': String(retryAfterSeconds) },
  });
}

async function hit({ rule, key }: RateLimitCheck, nowSeconds: number) {
  const window = Math.floor(nowSeconds / rule.windowSeconds);
  const redisKey = `rl:${rule.name}:${key}:${window}`;
  // Both commands go out together (one round trip), in this order, on the one connection.
  const [count] = await Promise.all([
    redis.incr(redisKey),
    redis.expire(redisKey, rule.windowSeconds, 'NX'),
  ]);
  return {
    rule,
    count,
    // Seconds until this window ends and the counter starts again from zero.
    retryAfterSeconds: Math.ceil((window + 1) * rule.windowSeconds - nowSeconds),
  };
}

// While Redis is down every login would log this; once a minute is enough.
let lastWarningAt = 0;

function warnRedisDown(error: unknown): void {
  const now = Date.now();
  if (now - lastWarningAt < 60_000) return;
  lastWarningAt = now;
  logger.warn({ err: error }, 'Rate limiter cannot reach Redis: letting requests through');
}
