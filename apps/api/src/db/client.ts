import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env';
import { logger } from '../lib/logger';

export type DatabaseOptions = {
  /** Defaults to DATABASE_URL. */
  connectionString?: string;
  /** Defaults to DATABASE_POOL_MAX. */
  maxConnections?: number;
  /**
   * Server-side limit per SQL statement, in ms (0 = none). Requests get 10 s; scripts that run
   * long statements on purpose (migrations, the large seed) pass 0.
   */
  statementTimeoutMs?: number;
};

/**
 * Creates a connection pool plus a Drizzle instance on top of it.
 *
 * Opening a Postgres connection is expensive (TCP + TLS handshake, authentication, and a new server
 * process for every connection), so a pool opens at most `max` connections, keeps them open and
 * lends one out per query. Nothing connects until the first query.
 */
export function createDatabase(options: DatabaseOptions = {}) {
  const pool = new Pool({
    connectionString: options.connectionString ?? env.DATABASE_URL,
    max: options.maxConnections ?? env.DATABASE_POOL_MAX,
    // Waiting longer than this for a connection means the database is down or every connection is
    // busy: fail the request rather than let it hang.
    connectionTimeoutMillis: 5_000,
    // Close connections that sat unused for 30 s; they're reopened on demand.
    idleTimeoutMillis: 30_000,
    // Safety nets enforced by Postgres itself: cancel a runaway statement, and end a session whose
    // transaction was left open (a bug), so it can't hold locks forever.
    statement_timeout: options.statementTimeoutMs ?? 10_000,
    idle_in_transaction_session_timeout: 30_000,
    // Shown in pg_stat_activity, so you can tell the API's connections from your psql session.
    application_name: 'devconnect-api',
  });

  // A connection sitting idle in the pool can still fail (database restart, network blip). Without
  // this listener Node treats the 'error' event as fatal and the whole API process crashes.
  pool.on('error', (error) => {
    logger.error({ err: error }, 'An idle database connection failed; the pool will replace it');
  });

  // The SQL-like query builder (docs/adr/0005). No `schema` option: that's only needed for
  // Drizzle's relational query API, which we deliberately don't use.
  return { pool, db: drizzle(pool) };
}

/** The API's shared pool and query builder. Import `db` to run queries. */
export const { pool, db } = createDatabase();

export type Database = typeof db;

/** An open transaction: the same query builder as `db`, with every query inside BEGIN … COMMIT. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Anything that can run queries: the shared `db` or an open transaction. */
export type Executor = Database | Transaction;

/** Readiness probe: runs a trivial query and returns the round trip in milliseconds. */
export async function pingDatabase(): Promise<number> {
  const started = performance.now();
  await pool.query('SELECT 1');
  return Math.round(performance.now() - started);
}

/** Closes all pooled connections, waiting for borrowed ones to be returned. Call once, at shutdown. */
export async function closeDatabase(): Promise<void> {
  await pool.end();
}
