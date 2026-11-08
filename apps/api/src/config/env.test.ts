import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('applies safe defaults when optional variables are missing', () => {
    expect(parseEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 4000,
      LOG_LEVEL: 'info',
      WEB_ORIGIN: 'http://localhost:3000',
      TRUST_PROXY_HOPS: 0,
    });
  });

  it('converts numeric strings into numbers', () => {
    expect(parseEnv({ PORT: '8080', TRUST_PROXY_HOPS: '2' })).toMatchObject({
      PORT: 8080,
      TRUST_PROXY_HOPS: 2,
    });
  });

  it('reduces WEB_ORIGIN to a bare origin (no path, no trailing slash)', () => {
    const env = parseEnv({ WEB_ORIGIN: 'https://devconnect.example.com/some/path/' });

    expect(env.WEB_ORIGIN).toBe('https://devconnect.example.com');
  });

  it.each([
    ['PORT', { PORT: 'not-a-number' }],
    ['PORT', { PORT: '70000' }],
    ['NODE_ENV', { NODE_ENV: 'staging' }],
    ['WEB_ORIGIN', { WEB_ORIGIN: 'ftp://example.com' }],
    ['LOG_LEVEL', { LOG_LEVEL: 'loud' }],
  ])('rejects an invalid %s with a message naming the variable', (name, source) => {
    expect(() => parseEnv(source)).toThrow(name);
  });
});
