import { apiSuccessSchema, readinessStatusSchema } from '@devconnect/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';

describe('GET /api/v1/health/ready (real database and Redis)', () => {
  it('reports both as up, with their round-trip times', async () => {
    const response = await request(createApp()).get('/api/v1/health/ready');

    expect(response.status).toBe(200);
    const body = apiSuccessSchema(readinessStatusSchema).parse(response.body);
    expect(body.data.status).toBe('ready');
    expect(body.data.checks.database.status).toBe('up');
    expect(body.data.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.data.checks.redis.status).toBe('up');
  });
});
