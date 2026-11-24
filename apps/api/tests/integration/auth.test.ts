import {
  apiErrorSchema,
  apiSuccessSchema,
  authSessionSchema,
  currentUserSchema,
} from '@devconnect/shared';
import { hash } from 'argon2';
import { eq, sql } from 'drizzle-orm';
import { SignJWT } from 'jose';
import request, { type Response } from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { env } from '../../src/config/env';
import { db } from '../../src/db/client';
import { profiles, refreshTokens, users } from '../../src/db/schema';
import { hashRefreshToken, verifyAccessToken } from '../../src/modules/auth/tokens';
import { resetDatabase, resetRedis } from '../helpers/db';

const app = createApp();
const ORIGIN = 'http://localhost:3000'; // WEB_ORIGIN in vitest.integration.config.ts
const sessionResponse = apiSuccessSchema(authSessionSchema);

const ada = {
  name: 'Ada Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  password: 'analytical engine notes 1843',
};

// ---- Helpers: HTTP calls the way the web app makes them ----------------------------------------

function register(body: Record<string, unknown> = ada) {
  return request(app).post('/api/v1/auth/register').set('Origin', ORIGIN).send(body);
}

function login(email = ada.email, password = ada.password) {
  return request(app).post('/api/v1/auth/login').set('Origin', ORIGIN).send({ email, password });
}

function refresh(token: string) {
  return request(app)
    .post('/api/v1/auth/refresh')
    .set('Origin', ORIGIN)
    .set('Cookie', `dc_rt=${token}`);
}

function logout(token?: string) {
  const call = request(app).post('/api/v1/auth/logout').set('Origin', ORIGIN);
  return token === undefined ? call : call.set('Cookie', `dc_rt=${token}`);
}

/** The dc_rt Set-Cookie header of a response: its value and its attributes. */
function setCookie(response: Response, name: string): string {
  const header = [response.headers['set-cookie'] ?? []]
    .flat()
    .find((cookie) => cookie.startsWith(`${name}=`));
  if (!header) throw new Error(`The response did not set the ${name} cookie`);
  return header;
}

function refreshCookie(response: Response): { value: string; header: string } {
  const header = setCookie(response, 'dc_rt');
  return { value: decodeURIComponent(header.slice('dc_rt='.length).split(';')[0] ?? ''), header };
}

/** Registers Ada and returns her first session (access token + refresh token). */
async function registerAda() {
  const response = await register();
  expect(response.status).toBe(201);
  return {
    accessToken: sessionResponse.parse(response.body).data.accessToken,
    refreshToken: refreshCookie(response).value,
  };
}

async function tokenRow(token: string) {
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashRefreshToken(token)));
  if (!row) throw new Error('No refresh_tokens row for this token');
  return row;
}

/** Moves a token's rotation into the past, past the 10-second grace period. */
async function ageRotation(token: string, seconds: number) {
  await db.execute(sql`
    update refresh_tokens set rotated_at = now() - make_interval(secs => ${seconds})
     where token_hash = ${hashRefreshToken(token)}
  `);
}

beforeEach(async () => {
  await resetDatabase();
  await resetRedis();
});

// ---- Register ------------------------------------------------------------------------------------

describe('POST /api/v1/auth/register', () => {
  it('creates the account and its profile, and starts a session', async () => {
    const response = await register();

    expect(response.status).toBe(201);
    const { data } = sessionResponse.parse(response.body);
    expect(data.user).toEqual({
      id: data.user.id, // a UUID (the response schema checked its format)
      username: 'ada',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      avatarUrl: null,
    });
    expect(data.expiresIn).toBe(env.JWT_ACCESS_TTL_SECONDS);
    await expect(verifyAccessToken(data.accessToken)).resolves.toMatchObject({
      userId: data.user.id,
    });

    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, data.user.id));
    expect(profile).toBeDefined();
  });

  it('stores an Argon2id hash, never the password', async () => {
    await register();

    const [user] = await db.select().from(users).where(eq(users.email, ada.email));
    expect(user?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(user?.passwordHash).not.toContain(ada.password);
  });

  it('sets the refresh token as a locked-down cookie, and stores only its hash', async () => {
    const response = await register();

    const cookie = refreshCookie(response);
    expect(cookie.header).toContain('HttpOnly');
    expect(cookie.header).toContain('Secure');
    expect(cookie.header).toContain('SameSite=Strict');
    expect(cookie.header).toContain('Path=/api/v1/auth');
    expect(cookie.header).toMatch(/Max-Age=604[78]\d\d/); // 7 days = 604,800 s, minus a moment
    // The body carries the access token only.
    expect(JSON.stringify(response.body)).not.toContain(cookie.value);

    const row = await tokenRow(cookie.value);
    expect(row.tokenHash).toBe(hashRefreshToken(cookie.value));
  });

  it('also sets a hint cookie that the web app can read, holding no secret', async () => {
    const response = await register();

    const hint = setCookie(response, 'dc_has_session');
    expect(hint).toMatch(/^dc_has_session=1;/);
    expect(hint).toContain('Path=/;');
    expect(hint).not.toContain('HttpOnly');
  });

  it('normalises what was typed: e-mail and username in lower case', async () => {
    const response = await register({ ...ada, email: ' Ada@Example.COM ', username: 'Ada' });

    expect(response.status).toBe(201);
    expect(sessionResponse.parse(response.body).data.user).toMatchObject({
      email: 'ada@example.com',
      username: 'ada',
    });
  });

  it('refuses a second account with the same email, ignoring case: 409 EMAIL_TAKEN', async () => {
    await register();

    const response = await register({ ...ada, username: 'ada-2', email: 'ADA@example.com' });

    expect(response.status).toBe(409);
    const body = apiErrorSchema.parse(response.body);
    expect(body.error.code).toBe('EMAIL_TAKEN');
    expect(body.error.details).toEqual([
      { path: 'email', message: 'An account with this email already exists.' },
    ]);
  });

  it('refuses a taken username: 409 USERNAME_TAKEN', async () => {
    await register();

    const response = await register({ ...ada, email: 'other@example.com' });

    expect(response.status).toBe(409);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('USERNAME_TAKEN');
  });

  it('lets the database decide between two simultaneous sign-ups with one email', async () => {
    const [first, second] = await Promise.all([
      register(),
      register({ ...ada, username: 'ada-2' }),
    ]);

    expect([first.status, second.status].sort()).toEqual([201, 409]);
    const [{ count }] = (await db.execute<{ count: number }>(sql`select count(*)::int from users`))
      .rows as [{ count: number }];
    expect(count).toBe(1);
  });

  it('answers 400 with a message per invalid field', async () => {
    const response = await register({
      name: '',
      username: 'admin',
      email: 'not-an-email',
      password: 'qwertyuiop123456',
    });

    expect(response.status).toBe(400);
    const body = apiErrorSchema.parse(response.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect((body.error.details as { path: string }[]).map((d) => d.path)).toEqual([
      'name',
      'username',
      'email',
      'password',
    ]);
  });

  it.each([
    ['without an Origin header', undefined],
    ['from another site', 'https://evil.example'],
  ])('answers 403 to a request %s (CSRF defence)', async (_case, origin) => {
    const call = request(app).post('/api/v1/auth/register').send(ada);
    const response = await (origin === undefined ? call : call.set('Origin', origin));

    expect(response.status).toBe(403);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('FORBIDDEN');
  });
});

// ---- Login ---------------------------------------------------------------------------------------

describe('POST /api/v1/auth/login', () => {
  it('starts a new session for the right password', async () => {
    await register();

    const response = await login();

    expect(response.status).toBe(200);
    expect(sessionResponse.parse(response.body).data.user.username).toBe('ada');
    expect(refreshCookie(response).value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await register();

    const wrongPassword = await login(ada.email, 'not the right password at all');
    const unknownEmail = await login('nobody@example.com', ada.password);

    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.status).toBe(401);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    const strip = (r: Response) => {
      const { error, ...rest } = apiErrorSchema.parse(r.body);
      return { ...rest, code: error.code };
    };
    expect(strip(unknownEmail)).toEqual(strip(wrongPassword));
    expect(strip(wrongPassword)).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('throttles guessing on one account: the 11th attempt in 15 minutes gets 429', async () => {
    await register();

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      expect((await login(ada.email, `wrong guess number ${attempt}`)).status).toBe(401);
    }
    const limited = await login(); // even the right password: the limiter runs first

    expect(limited.status).toBe(429);
    expect(apiErrorSchema.parse(limited.body).error.code).toBe('RATE_LIMITED');
    const retryAfter = Number(limited.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);

    // Other accounts aren't affected by Ada's limit.
    await register({ ...ada, username: 'grace', email: 'grace@example.com' });
    expect((await login('grace@example.com', ada.password)).status).toBe(200);
  });

  it('upgrades a hash made with older, weaker parameters', async () => {
    await register();
    const weak = await hash(ada.password, { memoryCost: 4096, timeCost: 1, parallelism: 1 });
    await db.update(users).set({ passwordHash: weak }).where(eq(users.email, ada.email));

    expect((await login()).status).toBe(200);

    const [user] = await db.select().from(users).where(eq(users.email, ada.email));
    expect(user?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });
});

// ---- Current user --------------------------------------------------------------------------------

describe('GET /api/v1/auth/me', () => {
  it('returns the signed-in user for a valid access token', async () => {
    const { accessToken } = await registerAda();

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(200);
    expect(apiSuccessSchema(currentUserSchema).parse(response.body).data.user.email).toBe(
      ada.email,
    );
  });

  it('answers 401 UNAUTHENTICATED without a token', async () => {
    const response = await request(app).get('/api/v1/auth/me');

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('UNAUTHENTICATED');
  });

  it('answers 401 TOKEN_EXPIRED for an expired token', async () => {
    const { accessToken } = await registerAda();
    const { userId, sessionId } = await verifyAccessToken(accessToken);
    const now = Math.floor(Date.now() / 1000);
    const expired = await new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setSubject(userId)
      .setIssuer('devconnect-api')
      .setAudience('devconnect-web')
      .setIssuedAt(now - 1000)
      .setExpirationTime(now - 100)
      .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));

    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expired}`);

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('TOKEN_EXPIRED');
  });
});

// ---- Refresh -------------------------------------------------------------------------------------

describe('POST /api/v1/auth/refresh', () => {
  it('rotates: a new refresh token in the same family, the old one marked as used', async () => {
    const { refreshToken: first } = await registerAda();

    const response = await refresh(first);

    expect(response.status).toBe(200);
    const second = refreshCookie(response).value;
    expect(second).not.toBe(first);
    const { data } = sessionResponse.parse(response.body);
    expect(data.user.username).toBe('ada');

    const [oldRow, newRow] = [await tokenRow(first), await tokenRow(second)];
    expect(oldRow.rotatedAt).not.toBeNull();
    expect(oldRow.replacedBy).toBe(newRow.id);
    expect(newRow.familyId).toBe(oldRow.familyId);
    // The new access token belongs to the same session (sid = family id).
    await expect(verifyAccessToken(data.accessToken)).resolves.toMatchObject({
      sessionId: oldRow.familyId,
    });
  });

  it('detects reuse: an old token presented after the grace period ends the whole session', async () => {
    const { refreshToken: first } = await registerAda();
    const second = refreshCookie(await refresh(first)).value;
    await ageRotation(first, 11);

    const replay = await refresh(first); // an attacker with a copy of the old token

    expect(replay.status).toBe(401);
    expect(refreshCookie(replay).header).toMatch(/Expires=Thu, 01 Jan 1970/); // cookie deleted
    // The legitimate holder of the newest token is logged out too: the family is revoked.
    expect((await refresh(second)).status).toBe(401);
    expect((await tokenRow(second)).revokedAt).not.toBeNull();
  });

  it('forgives a repeat within 10 seconds (two tabs, or a retried request): a sibling token', async () => {
    const { refreshToken: first } = await registerAda();
    const second = refreshCookie(await refresh(first)).value;

    const repeat = await refresh(first);

    expect(repeat.status).toBe(200);
    const sibling = refreshCookie(repeat).value;
    expect((await tokenRow(sibling)).familyId).toBe((await tokenRow(second)).familyId);
    // Both live tokens keep working.
    expect((await refresh(second)).status).toBe(200);
    expect((await refresh(sibling)).status).toBe(200);
  });

  it('handles many simultaneous refreshes with one token without revoking the session', async () => {
    const { refreshToken } = await registerAda();

    const responses = await Promise.all(Array.from({ length: 5 }, () => refresh(refreshToken)));

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    const rows = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.familyId, (await tokenRow(refreshToken)).familyId));
    expect(rows).toHaveLength(6); // the original + 1 successor + 4 grace siblings
    expect(rows.filter((row) => row.revokedAt !== null)).toHaveLength(0);
  });

  it('refuses an expired token', async () => {
    const { refreshToken } = await registerAda();
    await db.execute(sql`
      update refresh_tokens
         set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
       where token_hash = ${hashRefreshToken(refreshToken)}
    `);

    expect((await refresh(refreshToken)).status).toBe(401);
  });

  it('slides the expiry forward, but never past the 30-day cap of the session', async () => {
    const { refreshToken } = await registerAda();
    await db.execute(sql`
      update refresh_tokens
         set expires_at = now() + interval '1 hour', family_expires_at = now() + interval '1 day'
       where token_hash = ${hashRefreshToken(refreshToken)}
    `);

    const response = await refresh(refreshToken);

    expect(response.status).toBe(200);
    const next = await tokenRow(refreshCookie(response).value);
    expect(next.expiresAt.getTime()).toBe(next.familyExpiresAt.getTime());
    expect(refreshCookie(response).header).toMatch(/Max-Age=86[34]\d\d/); // ~1 day, not 7
  });

  it('refuses any token of a revoked session, even one that escaped the revocation', async () => {
    // The race the family check exists for: a token inserted while a logout was running.
    const { refreshToken } = await registerAda();
    const { familyId, userId } = await tokenRow(refreshToken);
    await logout(refreshToken);
    const straggler = 'S'.repeat(43);
    await db.insert(refreshTokens).values({
      userId,
      familyId,
      tokenHash: hashRefreshToken(straggler),
      expiresAt: sql`now() + interval '1 day'`,
      familyExpiresAt: sql`now() + interval '2 days'`,
    });

    expect((await refresh(straggler)).status).toBe(401);
  });

  it.each([
    ['no cookie', undefined],
    ['a malformed cookie', 'not-a-token'],
    ['an unknown token', 'A'.repeat(43)],
  ])('answers 401 UNAUTHENTICATED to %s', async (_case, token) => {
    const call = request(app).post('/api/v1/auth/refresh').set('Origin', ORIGIN);
    const response = await (token === undefined ? call : call.set('Cookie', `dc_rt=${token}`));

    expect(response.status).toBe(401);
    expect(apiErrorSchema.parse(response.body).error.code).toBe('UNAUTHENTICATED');
  });

  it('answers 403 to a cross-site request, even with a valid cookie', async () => {
    const { refreshToken } = await registerAda();

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Origin', 'https://evil.example')
      .set('Cookie', `dc_rt=${refreshToken}`);

    expect(response.status).toBe(403);
    expect((await tokenRow(refreshToken)).rotatedAt).toBeNull(); // nothing happened
  });
});

// ---- Logout --------------------------------------------------------------------------------------

describe('POST /api/v1/auth/logout', () => {
  it('ends this session and deletes the cookie', async () => {
    const { refreshToken } = await registerAda();

    const response = await logout(refreshToken);

    expect(response.status).toBe(204);
    expect(refreshCookie(response).header).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(setCookie(response, 'dc_has_session')).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await refresh(refreshToken)).status).toBe(401);
  });

  it('leaves the other sessions (other devices) alone', async () => {
    const { refreshToken: laptop } = await registerAda();
    const phone = refreshCookie(await login()).value;

    await logout(laptop);

    expect((await refresh(phone)).status).toBe(200);
  });

  it('succeeds without a cookie (logging out twice is fine)', async () => {
    expect((await logout()).status).toBe(204);
  });
});

describe('POST /api/v1/auth/logout-all', () => {
  it('ends every session of the user', async () => {
    const { accessToken, refreshToken: laptop } = await registerAda();
    const phone = refreshCookie(await login()).value;

    const response = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(response.status).toBe(204);
    expect((await refresh(laptop)).status).toBe(401);
    expect((await refresh(phone)).status).toBe(401);
  });

  it('requires an access token', async () => {
    expect((await request(app).post('/api/v1/auth/logout-all')).status).toBe(401);
  });
});
