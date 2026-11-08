import { apiErrorSchema, apiSuccessSchema, healthStatusSchema } from '@devconnect/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

// Supertest sends real HTTP requests to the app in memory: no port, no running server.
const app = createApp();

describe('GET /api/v1/health', () => {
  it('responds 200 with the standard success envelope', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    const body = apiSuccessSchema(healthStatusSchema).parse(response.body);
    expect(body.data.status).toBe('ok');
  });

  it('sets security, caching and tracing headers', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('request ids', () => {
  it('reuses a well-formed X-Request-Id sent by a proxy', async () => {
    const response = await request(app).get('/api/v1/health').set('X-Request-Id', 'edge-1234-abcd');

    expect(response.headers['x-request-id']).toBe('edge-1234-abcd');
  });

  it('replaces a malformed X-Request-Id with a fresh one', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', 'not ok; injected=true');

    expect(response.headers['x-request-id']).not.toBe('not ok; injected=true');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('error handling', () => {
  it('returns the JSON 404 envelope for unknown routes', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');

    expect(response.status).toBe(404);
    const body = apiErrorSchema.parse(response.body);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('rejects malformed JSON with 400 VALIDATION_ERROR', async () => {
    const response = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{"broken": ');

    expect(response.status).toBe(400);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects bodies over 100 kB with 413 PAYLOAD_TOO_LARGE', async () => {
    const response = await request(app)
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(110 * 1024) }));

    expect(response.status).toBe(413);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('CORS', () => {
  it('allows the configured web origin, with credentials', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:3000');

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not allow any other origin', async () => {
    const response = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example');

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers CORS preflight requests', async () => {
    const response = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'POST');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-methods']).toContain('POST');
  });
});
