import { DatabaseError } from 'pg';
import { describe, expect, it } from 'vitest';
import { PG_ERROR_CODES, findPgError, isPgError } from './pg-errors';

function uniqueViolation(constraint: string): DatabaseError {
  const error = new DatabaseError('duplicate key value violates unique constraint', 0, 'error');
  error.code = PG_ERROR_CODES.UNIQUE_VIOLATION;
  error.constraint = constraint;
  return error;
}

describe('findPgError', () => {
  it('returns a Postgres error thrown directly', () => {
    const error = uniqueViolation('users_email_key');
    expect(findPgError(error)).toBe(error);
  });

  it('unwraps the cause chain (how Drizzle reports driver errors)', () => {
    const pgError = uniqueViolation('users_email_key');
    const wrapped = new Error('Failed query: insert into "users" ...', { cause: pgError });
    expect(findPgError(wrapped)).toBe(pgError);
  });

  it('returns undefined for errors that did not come from Postgres', () => {
    expect(findPgError(new Error('boom'))).toBeUndefined();
    expect(findPgError('not even an Error')).toBeUndefined();
  });
});

describe('isPgError', () => {
  const wrapped = new Error('Failed query', { cause: uniqueViolation('users_email_key') });

  it('matches on the SQLSTATE code alone', () => {
    expect(isPgError(wrapped, PG_ERROR_CODES.UNIQUE_VIOLATION)).toBe(true);
    expect(isPgError(wrapped, PG_ERROR_CODES.CHECK_VIOLATION)).toBe(false);
  });

  it('matches on code and constraint name together', () => {
    expect(isPgError(wrapped, PG_ERROR_CODES.UNIQUE_VIOLATION, 'users_email_key')).toBe(true);
    expect(isPgError(wrapped, PG_ERROR_CODES.UNIQUE_VIOLATION, 'users_username_key')).toBe(false);
  });
});
