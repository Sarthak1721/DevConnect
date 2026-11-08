import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, toErrorResponse } from './errors';

const context = { requestId: 'req-123', exposeDebug: false };

describe('toErrorResponse', () => {
  it('uses the status, code and message of an AppError', () => {
    const { statusCode, body } = toErrorResponse(
      new AppError(404, 'NOT_FOUND', 'Post not found'),
      context,
    );

    expect(statusCode).toBe(404);
    expect(body).toEqual({
      success: false,
      message: 'Post not found',
      error: { code: 'NOT_FOUND', requestId: 'req-123' },
    });
  });

  it('turns a ZodError into a 400 with one entry per invalid field', () => {
    const result = z.object({ email: z.email(), age: z.number() }).safeParse({ email: 'x' });
    if (result.success) throw new Error('expected validation to fail');

    const { statusCode, body } = toErrorResponse(result.error, context);

    expect(statusCode).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    const details = body.error.details as { path: string; message: string }[];
    expect(details.map((issue) => issue.path)).toEqual(['email', 'age']);
    expect(details.every((issue) => issue.message.length > 0)).toBe(true);
  });

  it('maps body-parser errors to the matching client error', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      status: 413,
      type: 'entity.too.large',
    });

    expect(toErrorResponse(tooLarge, context)).toMatchObject({
      statusCode: 413,
      body: { error: { code: 'PAYLOAD_TOO_LARGE' } },
    });
  });

  it('hides the details of unexpected errors', () => {
    const { statusCode, body } = toErrorResponse(
      new Error('database password is hunter2'),
      context,
    );

    expect(statusCode).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(body.debug).toBeUndefined();
  });

  it('includes debug information only when exposeDebug is true', () => {
    const { body } = toErrorResponse(new Error('boom'), { exposeDebug: true });

    expect(body.debug).toMatchObject({ name: 'Error', message: 'boom' });
    expect(body.debug?.stack).toContain('boom');
  });

  it('handles values that are not Error objects', () => {
    const { statusCode, body } = toErrorResponse('a thrown string', { exposeDebug: true });

    expect(statusCode).toBe(500);
    expect(body.debug?.message).toBe('a thrown string');
  });
});
