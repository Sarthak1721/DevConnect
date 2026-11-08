import { z } from 'zod';

/** Payload of GET /api/v1/health: "the API process is up and answering". */
export const healthStatusSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.number().int().nonnegative(),
  timestamp: z.iso.datetime(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;
