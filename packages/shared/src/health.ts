import { z } from 'zod';

/** Payload of GET /api/v1/health: "the API process is up and answering". */
export const healthStatusSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;

const dependencyUpSchema = z.object({
  status: z.literal('up'),
  latencyMs: z.number().int().nonnegative(),
});

/**
 * Payload of GET /api/v1/health/ready: "the API can serve real traffic".
 *
 * The database is required: without it, the endpoint answers 503 SERVICE_UNAVAILABLE instead.
 * Redis is optional: without it the API still works (only rate limiting is off), so the answer is
 * 200 with status "degraded". Answering 503 there would make a load balancer take the API out of
 * service because of a dependency it can live without.
 */
export const readinessStatusSchema = z.object({
  status: z.enum(['ready', 'degraded']),
  checks: z.object({
    database: dependencyUpSchema,
    redis: z.discriminatedUnion('status', [
      dependencyUpSchema,
      z.object({ status: z.literal('down') }),
    ]),
  }),
});

export type ReadinessStatus = z.infer<typeof readinessStatusSchema>;
