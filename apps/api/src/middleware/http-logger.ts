import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../lib/logger';

// Accept a correlation id from an upstream proxy only if it looks like an id.
// Anything else (spaces, newlines, huge strings) could be used to forge log lines.
const SAFE_INCOMING_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Per-request logging middleware:
 *  - gives every request an id and returns it in the X-Request-Id response header
 *  - writes exactly one log line when the response finishes (method, url, status, duration)
 */
export const httpLogger = pinoHttp({
  logger,

  genReqId(req, res) {
    const incoming = req.headers['x-request-id'];
    const id =
      typeof incoming === 'string' && SAFE_INCOMING_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },

  // The log level follows the outcome: server errors are errors, client errors are warnings.
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  customSuccessMessage: (req, res, responseTime) =>
    `${req.method} ${req.url} → ${res.statusCode} (${Math.round(responseTime)} ms)`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} → ${res.statusCode}`,

  // Keep access logs small and free of personal data: no headers, no bodies, no IP addresses.
  serializers: {
    req: (req: { id: unknown; method: string; url: string }) => ({
      id: req.id,
      method: req.method,
      url: req.url,
    }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },

  // Platforms poll the health endpoint every few seconds; logging each poll is noise.
  autoLogging: {
    ignore: (req) => req.method === 'GET' && req.url?.split('?')[0] === '/api/v1/health',
  },
});
