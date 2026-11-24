import { decodeJwt, decodeProtectedHeader, SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { env } from '../../config/env';
import {
  generateRefreshToken,
  hashRefreshToken,
  isWellFormedRefreshToken,
  signAccessToken,
  verifyAccessToken,
} from './tokens';

const claims = {
  userId: '019a8e2f-5c3b-7d2e-9f10-2b3c4d5e6f70',
  sessionId: '019a8e2f-5c3b-7d2e-9f10-2b3c4d5e6f71',
};
const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

/** A token like ours, with one thing changed: what an attacker or a bug might produce. */
function forge(change: { alg?: string; typ?: string; iss?: string; aud?: string; exp?: number }) {
  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: change.alg ?? 'HS256', typ: change.typ ?? 'at+jwt' })
    .setSubject(claims.userId)
    .setIssuer(change.iss ?? 'devconnect-api')
    .setAudience(change.aud ?? 'devconnect-web')
    .setIssuedAt()
    .setExpirationTime(change.exp ?? '15m')
    .sign(secret);
}

describe('access tokens', () => {
  it('round-trips the user and session ids', async () => {
    const token = await signAccessToken(claims);

    await expect(verifyAccessToken(token)).resolves.toEqual(claims);
  });

  it('carries only ids and times, readable by anyone (so never put secrets in it)', async () => {
    const token = await signAccessToken(claims);

    expect(decodeProtectedHeader(token)).toEqual({ alg: 'HS256', typ: 'at+jwt' });
    const payload = decodeJwt(token);
    expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'iss', 'sid', 'sub']);
    expect(payload.exp! - payload.iat!).toBe(env.JWT_ACCESS_TTL_SECONDS);
  });

  it('reports an expired token as "expired" (worth refreshing)', async () => {
    const token = await forge({ exp: Math.floor(Date.now() / 1000) - 1 });

    await expect(verifyAccessToken(token)).rejects.toMatchObject({ reason: 'expired' });
  });

  it.each([
    ['another issuer', { iss: 'someone-else' }],
    ['another audience', { aud: 'another-app' }],
    ['another token type', { typ: 'JWT' }],
    ['another HMAC algorithm, same secret', { alg: 'HS512' }],
  ])('rejects a token with %s', async (_case, change) => {
    await expect(verifyAccessToken(await forge(change))).rejects.toMatchObject({
      reason: 'invalid',
    });
  });

  it('rejects an unsigned token ("alg": "none")', async () => {
    const unsigned = new UnsecuredJWT({ sid: claims.sessionId })
      .setSubject(claims.userId)
      .setIssuer('devconnect-api')
      .setAudience('devconnect-web')
      .setIssuedAt()
      .setExpirationTime('15m')
      .encode();

    await expect(verifyAccessToken(unsigned)).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('rejects a token whose payload was edited after signing', async () => {
    const [header, , signature] = (await signAccessToken(claims)).split('.');
    const payload = Buffer.from(
      JSON.stringify({ ...decodeJwt(await signAccessToken(claims)), sub: 'someone-else' }),
    ).toString('base64url');

    await expect(verifyAccessToken(`${header}.${payload}.${signature}`)).rejects.toMatchObject({
      reason: 'invalid',
    });
  });

  it('rejects a token signed with a different secret', async () => {
    const otherSecret = new TextEncoder().encode('a'.repeat(43));
    const token = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setSubject(claims.userId)
      .setIssuer('devconnect-api')
      .setAudience('devconnect-web')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(otherSecret);

    await expect(verifyAccessToken(token)).rejects.toMatchObject({ reason: 'invalid' });
  });
});

describe('refresh tokens', () => {
  it('are 43 URL-safe characters (32 random bytes) and never repeat', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateRefreshToken));

    expect(tokens.size).toBe(1000);
    for (const token of tokens) expect(isWellFormedRefreshToken(token)).toBe(true);
  });

  it('are stored as a 64-character hex SHA-256, the format the database accepts', () => {
    const hash = hashRefreshToken(generateRefreshToken());

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(['', 'short', `${'a'.repeat(43)}=`, `${'a'.repeat(42)}!`])(
    'treats %j as malformed',
    (value) => {
      expect(isWellFormedRefreshToken(value)).toBe(false);
    },
  );
});
