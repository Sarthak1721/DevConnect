import { z } from 'zod';

/** Payload of GET /api/v1/health: "the API process is up and answering". */
export const healthStatusSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;

/**
 * Payload of GET /api/v1/health/ready: "the API can serve real traffic", which includes reaching
 * its database. When it can't, the endpoint answers 503 with error code SERVICE_UNAVAILABLE.
 */
export const readinessStatusSchema = z.object({
  status: z.literal('ready'),
  checks: z.object({
    database: z.object({
      status: z.literal('up'),
      latencyMs: z.number().int().nonnegative(),
    }),
  }),
});

export type ReadinessStatus = z.infer<typeof readinessStatusSchema>;
