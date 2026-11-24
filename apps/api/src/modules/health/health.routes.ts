import type { ApiSuccess, HealthStatus, ReadinessStatus } from '@devconnect/shared';
import { Router } from 'express';
import { pingDatabase } from '../../db/client';
import { AppError } from '../../lib/errors';
import { pingRedis } from '../../lib/redis';

export const healthRouter = Router();

/**
 * Liveness: "is the process up and able to answer HTTP?"
 *
 * Deliberately touches no database. If Postgres goes down, restarting the API wouldn't help, so a
 * platform watching this endpoint shouldn't restart us; it should stop sending traffic (readiness).
 */
healthRouter.get('/', (_req, res) => {
  const body: ApiSuccess<HealthStatus> = {
    success: true,
    data: {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  };
  res.json(body);
});

/**
 * Readiness: "can I serve real traffic right now?" Load balancers and deploy pipelines use it to
 * decide whether to send traffic here: 200 = yes, 503 = not now (try again or route elsewhere).
 *
 * The database is required (503 without it); Redis is optional (200 "degraded" without it).
 */
healthRouter.get('/ready', async (_req, res) => {
  // Both checks at once: the endpoint takes as long as the slower one, not the sum of both.
  const [database, redis] = await Promise.allSettled([pingDatabase(), pingRedis()]);

  if (database.status === 'rejected') {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'The API cannot reach its database right now.', {
      cause: database.reason,
      details: { database: 'down', redis: redis.status === 'fulfilled' ? 'up' : 'down' },
    });
  }

  const redisCheck =
    redis.status === 'fulfilled'
      ? ({ status: 'up', latencyMs: redis.value } as const)
      : ({ status: 'down' } as const);

  const body: ApiSuccess<ReadinessStatus> = {
    success: true,
    data: {
      status: redisCheck.status === 'up' ? 'ready' : 'degraded',
      checks: { database: { status: 'up', latencyMs: database.value }, redis: redisCheck },
    },
  };
  res.json(body);
});
