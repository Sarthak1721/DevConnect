import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

// The variables without a default. Every test starts from them.
const required = {
  DATABASE_URL: 'postgresql://devconnect:devconnect@127.0.0.1:5432/devconnect',
  REDIS_URL: 'redis://127.0.0.1:6379',
  JWT_ACCESS_SECRET: 'x'.repeat(43),
};

describe('parseEnv', () => {
  it('applies safe defaults when optional variables are missing', () => {
    expect(parseEnv(required)).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      LOG_LEVEL: 'info',
      WEB_ORIGIN: 'http://localhost:3000',
      TRUST_PROXY_HOPS: 0,
      DATABASE_URL: required.DATABASE_URL,
      DATABASE_POOL_MAX: 10,
      REDIS_URL: required.REDIS_URL,
      JWT_ACCESS_SECRET: required.JWT_ACCESS_SECRET,
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 7,
    });
  });

  it('converts numeric strings into numbers', () => {
    expect(
      parseEnv({
        ...required,
        PORT: '8080',
        TRUST_PROXY_HOPS: '2',
        DATABASE_POOL_MAX: '5',
        JWT_ACCESS_TTL_SECONDS: '600',
        REFRESH_TOKEN_TTL_DAYS: '14',
      }),
    ).toMatchObject({
      PORT: 8080,
      TRUST_PROXY_HOPS: 2,
      DATABASE_POOL_MAX: 5,
      JWT_ACCESS_TTL_SECONDS: 600,
      REFRESH_TOKEN_TTL_DAYS: 14,
    });
  });

  it('reduces WEB_ORIGIN to a bare origin (no path, no trailing slash)', () => {
    const env = parseEnv({ ...required, WEB_ORIGIN: 'https://devconnect.example.com/some/path/' });

    expect(env.WEB_ORIGIN).toBe('https://devconnect.example.com');
  });

  it('accepts both postgres:// and postgresql:// connection strings', () => {
    expect(() =>
      parseEnv({ ...required, DATABASE_URL: 'postgres://u:p@db.example.com/app' }),
    ).not.toThrow();
  });

  it('accepts a TLS Redis URL (rediss://), as managed Redis services require', () => {
    expect(() =>
      parseEnv({ ...required, REDIS_URL: 'rediss://default:secret@cache.example.com:6379' }),
    ).not.toThrow();
  });

  it.each(['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET'] as const)(
    'refuses to start without %s instead of guessing',
    (name) => {
      const source: Record<string, string | undefined> = { ...required };
      delete source[name];
      expect(() => parseEnv(source)).toThrow(name);
    },
  );

  it.each([
    ['PORT', { PORT: 'not-a-number' }],
    ['PORT', { PORT: '70000' }],
    ['NODE_ENV', { NODE_ENV: 'staging' }],
    ['WEB_ORIGIN', { WEB_ORIGIN: 'ftp://example.com' }],
    ['LOG_LEVEL', { LOG_LEVEL: 'loud' }],
    ['DATABASE_URL', { DATABASE_URL: 'mysql://u:p@localhost/app' }],
    ['DATABASE_POOL_MAX', { DATABASE_POOL_MAX: '0' }],
    ['REDIS_URL', { REDIS_URL: 'http://127.0.0.1:6379' }],
    ['JWT_ACCESS_SECRET', { JWT_ACCESS_SECRET: 'change-me' }],
    ['JWT_ACCESS_TTL_SECONDS', { JWT_ACCESS_TTL_SECONDS: '86400' }],
    ['REFRESH_TOKEN_TTL_DAYS', { REFRESH_TOKEN_TTL_DAYS: '365' }],
  ])('rejects an invalid %s with a message naming the variable', (name, source) => {
    expect(() => parseEnv({ ...required, ...source })).toThrow(name);
  });
});
