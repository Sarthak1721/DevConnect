import type { RequestHandler } from 'express';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

/**
 * CSRF defence for the endpoints that set or use the refresh-token cookie.
 *
 * The danger with cookies: the browser attaches them by itself, even when another site triggers
 * the request. SameSite=Strict already stops that in current browsers; this check is the second
 * lock. Browsers put an Origin header on every POST, and a web page can't forge it, so a POST
 * whose Origin isn't the DevConnect web app didn't come from the DevConnect web app.
 *
 * Requests without an Origin (curl, scripts) are refused too: pass -H "Origin: <WEB_ORIGIN>".
 * Endpoints that use the Authorization header need no such check: browsers never add that header
 * on their own.
 */
export const requireTrustedOrigin: RequestHandler = (req, _res, next) => {
  if (req.get('origin') !== env.WEB_ORIGIN) {
    throw new AppError(403, 'FORBIDDEN', 'This request must come from the DevConnect web app.');
  }
  next();
};
