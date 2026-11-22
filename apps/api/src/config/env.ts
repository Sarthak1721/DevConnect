import { z } from 'zod';

/**
 * Every environment variable the API reads is declared and validated here, in one place.
 * A missing or malformed value stops the server at startup with a clear message,
 * instead of failing later in the middle of a request.
 *
 * Variables are added in the phase that first needs them.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Browsers send Origin as scheme://host:port with no path or trailing slash,
  // so normalise the value to exactly that form, or CORS comparisons would never match.
  WEB_ORIGIN: z
    .url({ protocol: /^https?$/ })
    .default('http://localhost:3000')
    .transform((value) => new URL(value).origin),

  // How many reverse proxies (load balancer, CDN) sit in front of the API.
  // Express uses it to find the real client IP in X-Forwarded-For.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

  // PostgreSQL connection string: postgresql://user:password@host:port/database
  // Required, with no default: a production server must never quietly fall back to localhost.
  // It contains a password, so it is never logged.
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: 'Set DATABASE_URL to a postgresql:// connection string (see apps/api/.env.example)',
  }),

  // Most connections this process opens at once. Managed databases cap total connections,
  // so this is set deliberately per environment.
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
});

export type Env = z.infer<typeof envSchema>;

/** Validates a set of variables. Exported separately so tests can pass their own values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** The validated configuration for this process. Read config from here, never from process.env. */
export const env = parseEnv(process.env);
