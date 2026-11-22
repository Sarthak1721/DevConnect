import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

// The one variable without a default. Every test starts from it.
const required = { DATABASE_URL: 'postgresql://devconnect:devconnect@127.0.0.1:5432/devconnect' };

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
    });
  });

  it('converts numeric strings into numbers', () => {
    expect(
      parseEnv({ ...required, PORT: '8080', TRUST_PROXY_HOPS: '2', DATABASE_POOL_MAX: '5' }),
    ).toMatchObject({ PORT: 8080, TRUST_PROXY_HOPS: 2, DATABASE_POOL_MAX: 5 });
  });

  it('reduces WEB_ORIGIN to a bare origin (no path, no trailing slash)', () => {
    const env = parseEnv({ ...required, WEB_ORIGIN: 'https://devconnect.example.com/some/path/' });

    expect(env.WEB_ORIGIN).toBe('https://devconnect.example.com');
  });

  it('accepts both postgres:// and postgresql:// connection strings', () => {
    expect(() => parseEnv({ DATABASE_URL: 'postgres://u:p@db.example.com/app' })).not.toThrow();
  });

  it('refuses to start without DATABASE_URL instead of guessing localhost', () => {
    expect(() => parseEnv({})).toThrow('DATABASE_URL');
  });

  it.each([
    ['PORT', { PORT: 'not-a-number' }],
    ['PORT', { PORT: '70000' }],
    ['NODE_ENV', { NODE_ENV: 'staging' }],
    ['WEB_ORIGIN', { WEB_ORIGIN: 'ftp://example.com' }],
    ['LOG_LEVEL', { LOG_LEVEL: 'loud' }],
    ['DATABASE_URL', { DATABASE_URL: 'mysql://u:p@localhost/app' }],
    ['DATABASE_POOL_MAX', { DATABASE_POOL_MAX: '0' }],
  ])('rejects an invalid %s with a message naming the variable', (name, source) => {
    expect(() => parseEnv({ ...required, ...source })).toThrow(name);
  });
});
