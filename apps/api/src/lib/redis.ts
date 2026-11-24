import { createClient } from '@redis/client';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * The API's shared Redis connection (node-redis). Phase 3 keeps rate-limit counters in it; later
 * phases add locks and OAuth state.
 *
 * Redis is a helper here, not a source of truth: if it's unreachable the API keeps serving
 * requests (the rate limiter lets them through, see middleware/rate-limit.ts). So every setting
 * below is about failing FAST rather than making a request wait for Redis.
 */
export const redis = createClient({
  url: env.REDIS_URL,
  // While disconnected, reject commands at once instead of queueing them until Redis is back.
  disableOfflineQueue: true,
  // Redis answers in well under a millisecond; no answer within 500 ms means something is wrong.
  commandOptions: { timeout: 500 },
  socket: {
    connectTimeout: 2_000,
    // Keep reconnecting forever, waiting 100 ms, 200 ms, 400 ms, ... and at most 5 s between tries.
    reconnectStrategy: (retries) => Math.min(100 * 2 ** retries, 5_000),
  },
});

// Log changes of state, not every failed reconnect attempt (that would be one line every 5 s).
let reachable: boolean | undefined;

redis.on('ready', () => {
  reachable = true;
  logger.info('Redis connected');
});

// node-redis emits 'error' for every failed connection attempt. Like the pg pool, an 'error' event
// without a listener would crash the process.
redis.on('error', (error) => {
  if (reachable === false) return;
  reachable = false;
  logger.warn(
    { err: error },
    'Redis unreachable: rate limiting is off until it is back. Locally: `pnpm infra:up`.',
  );
});

/**
 * Starts connecting in the background. Not awaited: connect() only settles once a connection
 * succeeds, retrying meanwhile, and the API must start (and answer) even if Redis is down.
 */
export function connectRedis(): void {
  redis.connect().catch((error: unknown) => {
    logger.error({ err: error }, 'The Redis client could not start');
  });
}

/** Readiness probe: PING round trip in milliseconds. Throws when Redis isn't reachable. */
export async function pingRedis(): Promise<number> {
  const started = performance.now();
  await redis.ping();
  return Math.round(performance.now() - started);
}

/** At shutdown: let pending commands finish if connected, otherwise just stop reconnecting. */
export async function closeRedis(): Promise<void> {
  if (redis.isReady) {
    await redis.close();
  } else if (redis.isOpen) {
    redis.destroy();
  }
}
