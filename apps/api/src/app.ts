import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './middleware/error-handler';
import { httpLogger } from './middleware/http-logger';
import { noStore } from './middleware/no-store';
import { notFound } from './middleware/not-found';
import { apiRouter } from './routes';

/**
 * Builds the Express application WITHOUT starting a server.
 * server.ts calls .listen() on it; tests hand it to Supertest, which sends requests in memory.
 *
 * Order matters: a request passes through these middleware top to bottom until one of them
 * sends a response. Errors skip ahead to the error handler at the end.
 */
export function createApp(): Express {
  const app = express();

  // Don't advertise "X-Powered-By: Express" to attackers fingerprinting the stack.
  app.disable('x-powered-by');
  // Number of proxies in front of us, so req.ip is the real client and not the load balancer.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);

  // 1. Request id + one structured log line per request.
  app.use(httpLogger);
  // 2. Security headers (nosniff, frame protection, HSTS, ...).
  app.use(helmet());
  // 3. Which browser origins may call the API directly. In normal use the browser goes through
  //    the Next.js proxy (same origin), so this mainly matters for direct API access.
  app.use(
    cors({
      origin: [env.WEB_ORIGIN],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'Retry-After', 'RateLimit', 'RateLimit-Policy'],
      maxAge: 600,
    }),
  );
  // 4. Never cache by default (routes may opt in later).
  app.use(noStore);
  // 5. Parse JSON bodies; reject anything over 100 kB before it can tie up the server.
  app.use(express.json({ limit: '100kb' }));

  // 6. The API itself.
  app.use('/api/v1', apiRouter);

  // 7. No route matched → 404.
  app.use(notFound);
  // 8. Every error ends up here.
  app.use(errorHandler);

  return app;
}
