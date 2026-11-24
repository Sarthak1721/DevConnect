import { createApp } from './app';
import { env } from './config/env';
import { closeDatabase, pingDatabase } from './db/client';
import { logger } from './lib/logger';
import { closeRedis, connectRedis } from './lib/redis';
import { warmUpPasswordHashing } from './modules/auth/password';

const app = createApp();

// Express 5 passes startup errors (e.g. port already in use) to this callback.
const server = app.listen(env.PORT, (error?: Error) => {
  if (error) {
    const portInUse = 'code' in error && error.code === 'EADDRINUSE';
    logger.fatal(
      { err: error },
      portInUse
        ? `Port ${env.PORT} is already in use. Stop the other process or change PORT in apps/api/.env.`
        : 'The HTTP server failed to start.',
    );
    process.exit(1);
  }
  logger.info(`DevConnect API listening on http://localhost:${env.PORT}`);
  void reportDatabaseStatus();
  // Connects in the background and logs when it's ready (or that it isn't): see lib/redis.ts.
  connectRedis();
  // Prepares the hash that logins with unknown emails are checked against (modules/auth/password.ts).
  warmUpPasswordHashing().catch((hashError: unknown) => {
    logger.error({ err: hashError }, 'Argon2 failed: logins will fail until this is fixed');
  });
});

/**
 * A friendly heads-up at startup. Not fatal on purpose: in production the database may come back a
 * moment later, and the readiness endpoint (GET /api/v1/health/ready) reports 503 until it does.
 */
async function reportDatabaseStatus(): Promise<void> {
  try {
    const latencyMs = await pingDatabase();
    logger.info(`Database reachable (${latencyMs} ms)`);
  } catch (error) {
    logger.warn(
      { err: error },
      'Database unreachable. Locally: is Docker running and did you run `pnpm infra:up`?',
    );
  }
}

/**
 * Graceful shutdown. When the platform stops or redeploys us (SIGTERM) or you press Ctrl+C
 * (SIGINT): stop accepting new connections, let in-flight requests finish, then close the
 * database pool and the Redis connection (in that order: in-flight requests may still need them)
 * and exit.
 */
let shuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down gracefully');

  // Safety net: if open connections keep the server alive, force the exit after 10 s.
  setTimeout(() => {
    logger.error('Graceful shutdown timed out; forcing exit');
    process.exit(1);
  }, 10_000).unref();

  server.close((error) => {
    if (error) logger.error({ err: error }, 'Error while closing the HTTP server');
    void Promise.allSettled([closeDatabase(), closeRedis()])
      .then((results) => {
        for (const result of results) {
          if (result.status === 'rejected') {
            logger.error({ err: result.reason }, 'Error while closing a connection');
          }
        }
      })
      .finally(() => process.exit(error ? 1 : 0));
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// A bug escaped every try/catch. Log it, then crash: the platform restarts a clean process,
// which is safer than continuing in an unknown state.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});
