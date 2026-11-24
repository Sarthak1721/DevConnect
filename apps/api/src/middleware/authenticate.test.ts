import { apiErrorSchema } from '@devconnect/shared';
import express from 'express';
import { SignJWT } from 'jose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { env } from '../config/env';
import { signAccessToken } from '../modules/auth/tokens';
import { authenticate, authOf } from './authenticate';
import { errorHandler } from './error-handler';

// A tiny app with one protected route, to test the middleware on its own.
const app = express();
app.get('/protected', authenticate, (req, res) => {
  res.json(authOf(req));
});
app.use(errorHandler);

const claims = {
  userId: '019a8e2f-5c3b-7d2e-9f10-2b3c4d5e6f70',
  sessionId: '019a8e2f-5c3b-7d2e-9f10-2b3c4d5e6f71',
};

describe('authenticate middleware', () => {
  it('lets a request with a valid access token through, with the caller on req.auth', async () => {
    const token = await signAccessToken(claims);

    const response = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(claims);
  });

  it('answers 401 UNAUTHENTICATED with a bearer challenge when there is no token', async () => {
    const response = await request(app).get('/protected');

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('UNAUTHENTICATED');
    expect(response.headers['www-authenticate']).toBe('Bearer realm="devconnect"');
  });

  it.each(['Basic dXNlcjpwYXNz', 'Bearer', 'Bearer a b', 'Bearer not-a-jwt'])(
    'answers 401 UNAUTHENTICATED to the header %j',
    async (header) => {
      const response = await request(app).get('/protected').set('Authorization', header);

      expect(response.status).toBe(401);
      expect(apiErrorSchema.parse(response.body).error.code).toBe('UNAUTHENTICATED');
      expect(response.headers['www-authenticate']).toContain('error="invalid_token"');
    },
  );

  it('answers 401 TOKEN_EXPIRED to an expired token, so the web app knows to refresh', async () => {
    const expired = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setSubject(claims.userId)
      .setIssuer('devconnect-api')
      .setAudience('devconnect-web')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 1000)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 100)
      .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));

    const response = await request(app).get('/protected').set('Authorization', `Bearer ${expired}`);

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('TOKEN_EXPIRED');
    expect(response.headers['www-authenticate']).toContain('The access token expired');
  });
});
