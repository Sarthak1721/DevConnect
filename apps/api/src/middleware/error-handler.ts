import type { ErrorRequestHandler } from 'express';
import { env } from '../config/env';
import { toErrorResponse } from '../lib/errors';

/**
 * The single place that decides what a client sees when something fails.
 *
 * Express recognises error middleware by its FOUR parameters. Whenever a handler throws,
 * returns a rejected promise (Express 5 forwards those automatically), or calls next(err),
 * Express skips the remaining normal middleware and jumps here.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, next) => {
  // If the response has already started streaming, we can't send a JSON body any more:
  // hand the error to Express's built-in handler, which closes the connection.
  if (res.headersSent) {
    next(err);
    return;
  }

  const { statusCode, body } = toErrorResponse(err, {
    // Set by the http-logger middleware; always a string there.
    requestId: typeof req.id === 'string' ? req.id : undefined,
    exposeDebug: env.NODE_ENV === 'development',
  });

  if (statusCode >= 500) {
    // Attach the error so the request's log line includes it (with its stack trace).
    res.err = err instanceof Error ? err : new Error(String(err));
  }

  res.status(statusCode).json(body);
};
