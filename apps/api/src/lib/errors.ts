import type { ApiError, ErrorCode } from '@devconnect/shared';
import { ZodError } from 'zod';

/**
 * An expected, client-facing error ("this post doesn't exist", "you can't edit this").
 * Throw it from anywhere while handling a request; the central error handler
 * turns it into the standard JSON envelope with the right HTTP status.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options: { details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
  }
}

export type ErrorResponse = { statusCode: number; body: ApiError };

type ErrorContext = {
  requestId?: string;
  /** Include the original error (with stack) in the body. Only ever true in development. */
  exposeDebug: boolean;
};

/**
 * Converts anything that was thrown into an HTTP status + response body.
 * A pure function (no req/res), so every branch is easy to unit test.
 */
export function toErrorResponse(err: unknown, context: ErrorContext): ErrorResponse {
  const respond = (
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: unknown,
  ): ErrorResponse => ({
    statusCode,
    body: {
      success: false,
      message,
      error: {
        code,
        ...(details !== undefined && { details }),
        ...(context.requestId !== undefined && { requestId: context.requestId }),
      },
    },
  });

  // 1. Errors we threw on purpose.
  if (err instanceof AppError) {
    return respond(err.statusCode, err.code, err.message, err.details);
  }

  // 2. Input that failed a Zod schema (request validation arrives in Phase 3).
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return respond(400, 'VALIDATION_ERROR', 'The request contains invalid data.', details);
  }

  // 3. Client errors raised by Express's body parser (bad JSON, body too large, ...).
  const clientError = readClientHttpError(err);
  if (clientError) {
    switch (clientError.type) {
      case 'entity.parse.failed':
        return respond(400, 'VALIDATION_ERROR', 'The request body is not valid JSON.');
      case 'entity.too.large':
        return respond(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
      case 'encoding.unsupported':
      case 'charset.unsupported':
        return respond(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'The request body encoding is not supported.',
        );
      default:
        return respond(400, 'VALIDATION_ERROR', 'The request could not be processed.');
    }
  }

  // 4. Anything else is a bug. Clients get a generic message: internals are never leaked.
  const response = respond(
    500,
    'INTERNAL_ERROR',
    'Something went wrong on our side. Please try again later.',
  );
  if (context.exposeDebug) {
    const error = err instanceof Error ? err : new Error(String(err));
    response.body.debug = { name: error.name, message: error.message, stack: error.stack };
  }
  return response;
}

/** Recognises http-errors style objects ({ status: 4xx, type }) such as body-parser's. */
function readClientHttpError(err: unknown): { status: number; type?: string } | undefined {
  if (typeof err !== 'object' || err === null || !('status' in err)) return undefined;
  const { status } = err;
  if (typeof status !== 'number' || status < 400 || status >= 500) return undefined;
  const type = 'type' in err && typeof err.type === 'string' ? err.type : undefined;
  return type === undefined ? { status } : { status, type };
}
