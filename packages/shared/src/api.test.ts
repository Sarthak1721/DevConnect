import { describe, expect, it } from 'vitest';
import { apiErrorSchema, apiSuccessSchema, healthStatusSchema } from './index';

describe('apiSuccessSchema', () => {
  const healthResponse = apiSuccessSchema(healthStatusSchema);

  it('accepts a well-formed success envelope', () => {
    const result = healthResponse.safeParse({
      success: true,
      data: { status: 'ok', uptimeSeconds: 12, timestamp: '2026-10-10T10:00:00.000Z' },
    });

    expect(result.success).toBe(true);
  });

  it('rejects an envelope whose data does not match the inner schema', () => {
    const result = healthResponse.safeParse({
      success: true,
      data: { status: 'ok', uptimeSeconds: -5, timestamp: 'yesterday' },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an error envelope', () => {
    const result = healthResponse.safeParse({
      success: false,
      message: 'Nope',
      error: { code: 'NOT_FOUND' },
    });

    expect(result.success).toBe(false);
  });
});

describe('apiErrorSchema', () => {
  it('accepts a known error code', () => {
    const result = apiErrorSchema.safeParse({
      success: false,
      message: 'Route not found',
      error: { code: 'NOT_FOUND', requestId: 'abc-123' },
    });

    expect(result.success).toBe(true);
  });

  it('rejects an error code that is not part of the contract', () => {
    const result = apiErrorSchema.safeParse({
      success: false,
      message: 'Something odd',
      error: { code: 'TEAPOT' },
    });

    expect(result.success).toBe(false);
  });
});
