import { pino } from 'pino';
import { env } from '../config/env';

/**
 * Structured logger. Every log line is one JSON object, e.g.
 *   {"level":30,"time":"2026-10-10T10:00:00.000Z","req":{"id":"…","method":"GET"},"msg":"…"}
 * so a log platform can filter by field (requestId, statusCode, …) instead of grepping text.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'devconnect-api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,

  // Defence in depth: even if a header or object containing secrets reaches the logger,
  // these fields are replaced before anything is written.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },

  // Readable, coloured one-liners while developing; full JSON everywhere else (tests, production).
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss',
        // The message already says "GET /path → 200 (3 ms)"; hide the repeated fields.
        ignore: 'pid,hostname,service,env,req,res,responseTime',
      },
    },
  }),
});
