import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';

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
});

/**
 * Graceful shutdown. When the platform stops or redeploys us (SIGTERM) or you press Ctrl+C
 * (SIGINT): stop accepting new connections, let in-flight requests finish, then exit.
 * Database and Redis connections will be closed here too once they exist.
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
    process.exit(error ? 1 : 0);
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
