import type { ApiSuccess, HealthStatus } from '@devconnect/shared';
import { Router } from 'express';

export const healthRouter = Router();

/**
 * Liveness check: "is the process up and able to answer HTTP?"
 *
 * It deliberately touches no database. A readiness check (GET /health/ready: "can I serve
 * real traffic?", which also pings Postgres and Redis) arrives with those dependencies.
 * Hosting platforms call this endpoint to decide whether to restart the service.
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
