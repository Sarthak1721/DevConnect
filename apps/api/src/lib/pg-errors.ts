import { DatabaseError } from 'pg';

/**
 * SQLSTATE codes the API reacts to. Class 23 means "integrity constraint violation": the database
 * refused data that breaks one of its rules. Full list:
 * https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
export const PG_ERROR_CODES = {
  NOT_NULL_VIOLATION: '23502',
  FOREIGN_KEY_VIOLATION: '23503',
  UNIQUE_VIOLATION: '23505',
  CHECK_VIOLATION: '23514',
} as const;

/**
 * Finds the Postgres error inside whatever was thrown. Drizzle wraps driver errors in a
 * DrizzleQueryError ("Failed query: ...") and keeps the original error as `cause`.
 */
export function findPgError(error: unknown): DatabaseError | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined; depth += 1) {
    if (current instanceof DatabaseError) return current;
    current = current instanceof Error ? current.cause : undefined;
  }
  return undefined;
}

/**
 * True when `error` is a Postgres error with this SQLSTATE and, if given, this constraint name.
 * Phase 3 uses it to turn a unique violation on users_email_key into a 409 EMAIL_TAKEN.
 */
export function isPgError(error: unknown, code: string, constraint?: string): boolean {
  const pgError = findPgError(error);
  return pgError?.code === code && (constraint === undefined || pgError.constraint === constraint);
}
