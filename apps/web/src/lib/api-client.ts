import { apiErrorSchema, apiSuccessSchema, type ErrorCode } from '@devconnect/shared';
import type { ZodType } from 'zod';
import { getAccessToken, refreshSession } from './session';

/**
 * The one way the web app calls the API.
 *
 * Requests go to /api/v1/... on this site; Next.js forwards them to the Express API (the rewrite
 * in next.config.ts), so the browser only ever talks to one origin.
 *
 * With `auth: true` the access token is attached, and an expired one is handled transparently:
 *   request → 401 TOKEN_EXPIRED → refresh the session → repeat the request once.
 */

/** A failed API call, carrying the API's error code and details for the UI. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;
  /** From the Retry-After header of a 429. */
  readonly retryAfterSeconds: number | undefined;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    extra: { details?: unknown; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = extra.details;
    this.retryAfterSeconds = extra.retryAfterSeconds;
  }
}

type RequestOptions<TData> = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Schema of the response's `data`; omit it for endpoints that answer 204 No Content. */
  schema?: ZodType<TData>;
  /** Attach the access token (and refresh it when it expired). */
  auth?: boolean;
};

export async function apiFetch<TData = undefined>(
  path: string,
  { method = 'GET', body, schema, auth = false }: RequestOptions<TData> = {},
): Promise<TData> {
  // First authenticated call after a page load: get an access token before sending anything.
  if (auth && getAccessToken() === null) await refreshSession();

  const send = () => {
    const token = auth ? getAccessToken() : null;
    return fetch(`/api/v1${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token !== null && { Authorization: `Bearer ${token}` }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    }).catch(() => {
      // fetch() itself only fails when no response arrives at all.
      throw new ApiRequestError(
        0,
        'SERVICE_UNAVAILABLE',
        'Cannot reach DevConnect. Check your connection.',
      );
    });
  };

  let response = await send();
  if (auth && response.status === 401 && (await errorCodeOf(response)) === 'TOKEN_EXPIRED') {
    if (await refreshSession()) response = await send();
  }

  if (!response.ok) throw await toApiRequestError(response);
  if (response.status === 204 || schema === undefined) return undefined as TData;

  const parsed = apiSuccessSchema(schema).safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiRequestError(
      response.status,
      'INTERNAL_ERROR',
      'The server sent an unexpected response.',
    );
  }
  return parsed.data.data;
}

/** Reads the error code without consuming the body (a clone is read instead). */
async function errorCodeOf(response: Response): Promise<ErrorCode | undefined> {
  const parsed = apiErrorSchema.safeParse(
    await response
      .clone()
      .json()
      .catch(() => null),
  );
  return parsed.success ? parsed.data.error.code : undefined;
}

async function toApiRequestError(response: Response): Promise<ApiRequestError> {
  const parsed = apiErrorSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    // Not our JSON envelope: typically the Next.js proxy answering 500 because the API is down.
    return new ApiRequestError(
      response.status,
      'SERVICE_UNAVAILABLE',
      'DevConnect is not reachable right now. Please try again in a moment.',
    );
  }
  const retryAfter = Number(response.headers.get('retry-after'));
  return new ApiRequestError(response.status, parsed.data.error.code, parsed.data.message, {
    details: parsed.data.error.details,
    ...(Number.isFinite(retryAfter) && retryAfter > 0 && { retryAfterSeconds: retryAfter }),
  });
}
