import { Router } from 'express';
import { healthRouter } from './modules/health/health.routes';

/**
 * Every versioned API route, mounted under /api/v1 in app.ts.
 * Each feature module (auth, users, posts, ...) adds one line here as it is built.
 */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
