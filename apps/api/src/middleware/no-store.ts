import type { RequestHandler } from 'express';

/**
 * Marks every response as "never cache" by default.
 *
 * Many responses are personal (your feed, whether you liked a post), and in production the API
 * sits behind Vercel's CDN, which caches whatever the API's headers allow. Caching therefore has
 * to be an explicit opt-in on a route that is identical for every viewer, never the default.
 */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
