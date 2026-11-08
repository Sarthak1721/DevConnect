/**
 * Machine-readable error codes the API returns in `error.code`.
 *
 * They are part of the API contract: the web app branches on them
 * (e.g. TOKEN_EXPIRED → refresh the session and retry), so they live here,
 * where both the API and the web app import them from.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'INVALID_CREDENTIALS',
  'FORBIDDEN',
  'NOT_FOUND',
  'EMAIL_TAKEN',
  'USERNAME_TAKEN',
  'GITHUB_ALREADY_LINKED',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'UPSTREAM_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

/** Union of the strings above: 'VALIDATION_ERROR' | 'UNAUTHENTICATED' | ... */
export type ErrorCode = (typeof ERROR_CODES)[number];
