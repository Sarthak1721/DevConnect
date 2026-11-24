import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiRequestError } from './api-client';

/**
 * Puts an API error where the user will see it: next to the field it is about when the API names
 * one (validation errors, EMAIL_TAKEN, USERNAME_TAKEN all carry [{ path, message }] details),
 * otherwise at the top of the form.
 */
export function showApiError<TFields extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<TFields>,
  fields: readonly Path<TFields>[],
): void {
  if (!(error instanceof ApiRequestError)) {
    setError('root.server', { message: 'Something went wrong. Please try again.' });
    return;
  }

  let shownOnAField = false;
  if (Array.isArray(error.details)) {
    for (const detail of error.details as unknown[]) {
      const field = fields.find((name) => isDetailFor(detail, name));
      if (field && isDetailFor(detail, field)) {
        setError(field, { message: detail.message }, { shouldFocus: !shownOnAField });
        shownOnAField = true;
      }
    }
  }
  if (!shownOnAField) setError('root.server', { message: messageOf(error) });
}

function isDetailFor(detail: unknown, field: string): detail is { path: string; message: string } {
  return (
    typeof detail === 'object' &&
    detail !== null &&
    'path' in detail &&
    detail.path === field &&
    'message' in detail &&
    typeof detail.message === 'string'
  );
}

function messageOf(error: ApiRequestError): string {
  if (error.code === 'RATE_LIMITED' && error.retryAfterSeconds !== undefined) {
    const minutes = Math.ceil(error.retryAfterSeconds / 60);
    return `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
  }
  return error.message;
}
