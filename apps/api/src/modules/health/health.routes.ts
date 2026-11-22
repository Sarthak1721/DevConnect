import type { ApiSuccess, HealthStatus, ReadinessStatus } from '@devconnect/shared';
import { Router } from 'express';
import { pingDatabase } from '../../db/client';
import { AppError } from '../../lib/errors';

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
 * Readiness: "can I serve real traffic right now?" It checks the database (Redis joins in a later
 * phase). Load balancers and deploy pipelines use it to decide whether to send traffic here:
 * 200 = yes, 503 = not now (try again or route elsewhere).
 */
healthRouter.get('/ready', async (_req, res) => {
  let latencyMs: number;
  try {
    latencyMs = await pingDatabase();
  } catch (error) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'The API cannot reach its database right now.', {
      cause: error,
      details: { database: 'down' },
    });
  }

  const body: ApiSuccess<ReadinessStatus> = {
    success: true,
    data: { status: 'ready', checks: { database: { status: 'up', latencyMs } } },
  };
  res.json(body);
});
