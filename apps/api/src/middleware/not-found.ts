import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';

/**
 * Reached only when no route matched the request. Produces the standard JSON 404
 * instead of Express's default HTML "Cannot GET /..." page.
 */
export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `No route matches ${req.method} ${req.path}.`));
};
