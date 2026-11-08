import { z } from 'zod';
import { ERROR_CODES } from './errors';

/**
 * The response envelope. Every API response has one of two shapes:
 *
 *   success → { success: true,  data, meta? }
 *   failure → { success: false, message, error: { code, details?, requestId? } }
 *
 * A single, predictable shape means the web app can handle every endpoint the same way.
 */

/** Schema for a failed response. */
export const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  error: z.object({
    code: z.enum(ERROR_CODES),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
  /** Present only in development: the original error, to speed up debugging. */
  debug: z
    .object({ name: z.string(), message: z.string(), stack: z.string().optional() })
    .optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * Builds the schema for a successful response around any `data` schema,
 * e.g. apiSuccessSchema(healthStatusSchema).
 */
export function apiSuccessSchema<TData extends z.ZodType>(data: TData) {
  return z.object({
    success: z.literal(true),
    data,
    meta: z.record(z.string(), z.unknown()).optional(),
  });
}

/** Type of a successful response, for code that builds responses (the API). */
export type ApiSuccess<TData, TMeta extends Record<string, unknown> = Record<string, unknown>> = {
  success: true;
  data: TData;
  meta?: TMeta;
};
