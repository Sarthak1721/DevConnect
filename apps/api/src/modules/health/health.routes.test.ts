import { apiErrorSchema, apiSuccessSchema, readinessStatusSchema } from '@devconnect/shared';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app';
import { pingDatabase } from '../../db/client';

// Unit test: replace the real database ping with a controllable fake, so both outcomes can be
// tested without a database. (tests/integration/health.test.ts checks the real thing.)
vi.mock('../../db/client', () => ({ pingDatabase: vi.fn() }));
const ping = vi.mocked(pingDatabase);

const app = createApp();

describe('GET /api/v1/health/ready', () => {
  beforeEach(() => {
    ping.mockReset();
  });

  it('responds 200 with the database round-trip time when the database answers', async () => {
    ping.mockResolvedValue(3);

    const response = await request(app).get('/api/v1/health/ready');

    expect(response.status).toBe(200);
    const body = apiSuccessSchema(readinessStatusSchema).parse(response.body);
    expect(body.data.checks.database).toEqual({ status: 'up', latencyMs: 3 });
  });

  it('responds 503 SERVICE_UNAVAILABLE, without internal details, when it cannot', async () => {
    ping.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

    const response = await request(app).get('/api/v1/health/ready');

    expect(response.status).toBe(503);
    const body = apiErrorSchema.parse(response.body);
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.error.details).toEqual({ database: 'down' });
    // The driver's message (addresses, ports) stays in the server log, not in the response.
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });

  it('leaves liveness (GET /api/v1/health) independent of the database', async () => {
    ping.mockRejectedValue(new Error('database down'));

    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(ping).not.toHaveBeenCalled();
  });
});
