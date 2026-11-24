import { apiErrorSchema, apiSuccessSchema, readinessStatusSchema } from '@devconnect/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { pingDatabase } from '../../db/client';
import { pingRedis } from '../../lib/redis';

// Unit test: replace the real database and Redis pings with controllable fakes, so every outcome
// can be tested without either. (tests/integration/health.test.ts checks the real thing.)
vi.mock('../../db/client', () => ({ pingDatabase: vi.fn() }));
vi.mock('../../lib/redis', () => ({ pingRedis: vi.fn() }));
const pingDb = vi.mocked(pingDatabase);
const pingCache = vi.mocked(pingRedis);

const app = createApp();
const readinessResponse = apiSuccessSchema(readinessStatusSchema);

describe('GET /api/v1/health/ready', () => {
  beforeEach(() => {
    pingDb.mockReset();
    pingCache.mockReset();
  });

  it('responds 200 "ready" with both round-trip times when everything answers', async () => {
    pingDb.mockResolvedValue(3);
    pingCache.mockResolvedValue(1);

    const response = await request(app).get('/api/v1/health/ready');

    expect(response.status).toBe(200);
    const body = readinessResponse.parse(response.body);
    expect(body.data).toEqual({
      status: 'ready',
      checks: { database: { status: 'up', latencyMs: 3 }, redis: { status: 'up', latencyMs: 1 } },
    });
  });

  it('stays 200 but reports "degraded" when only Redis is down (it is optional)', async () => {
    pingDb.mockResolvedValue(3);
    pingCache.mockRejectedValue(new Error('The client is offline'));

    const response = await request(app).get('/api/v1/health/ready');

    expect(response.status).toBe(200);
    const body = readinessResponse.parse(response.body);
    expect(body.data.status).toBe('degraded');
    expect(body.data.checks.redis).toEqual({ status: 'down' });
  });

  it('responds 503 SERVICE_UNAVAILABLE, without internal details, when the database is down', async () => {
    pingDb.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'));
    pingCache.mockResolvedValue(1);

    const response = await request(app).get('/api/v1/health/ready');

    expect(response.status).toBe(503);
    const body = apiErrorSchema.parse(response.body);
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.error.details).toEqual({ database: 'down', redis: 'up' });
    // The driver's message (addresses, ports) stays in the server log, not in the response.
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });

  it('leaves liveness (GET /api/v1/health) independent of both', async () => {
    pingDb.mockRejectedValue(new Error('database down'));
    pingCache.mockRejectedValue(new Error('redis down'));

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(pingDb).not.toHaveBeenCalled();
    expect(pingCache).not.toHaveBeenCalled();
  });
});
