import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from './errors';
import { emailKey, enforceRateLimits, type RateLimitRule } from './rate-limit';
import { redis } from './redis';

// Unit test: a fake Redis whose answers each test controls. The integration tests use a real one.
vi.mock('./redis', () => ({ redis: { incr: vi.fn(), expire: vi.fn() } }));
const incr = vi.mocked(redis.incr);
const expire = vi.mocked(redis.expire);

const rule: RateLimitRule = { name: 'test', limit: 3, windowSeconds: 60 };

describe('enforceRateLimits (fixed window)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // t = 999,999,970 s. Window number n = ⌊t / 60⌋ = 16,666,666, which started at
    // n × 60 = 999,999,960 and ends at 1,000,000,020: we are 10 s in, 50 s from the end.
    vi.setSystemTime(new Date(999_999_970 * 1000));
    incr.mockReset();
    expire.mockReset().mockResolvedValue(1);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts the request in a key that includes the window number', async () => {
    incr.mockResolvedValue(1);

    await enforceRateLimits([{ rule, key: 'ip:203.0.113.7' }]);

    expect(incr).toHaveBeenCalledWith('rl:test:ip:203.0.113.7:16666666');
    // The key expires with its window; NX = only set an expiry if there isn't one yet.
    expect(expire).toHaveBeenCalledWith('rl:test:ip:203.0.113.7:16666666', 60, 'NX');
  });

  it('allows requests up to the limit', async () => {
    incr.mockResolvedValue(3);

    await expect(enforceRateLimits([{ rule, key: 'k' }])).resolves.toBeUndefined();
  });

  it('refuses the request after the limit with 429 and the seconds left in the window', async () => {
    incr.mockResolvedValue(4);

    const error = await enforceRateLimits([{ rule, key: 'k' }]).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMITED',
      // The window started 10 s ago and lasts 60 s.
      headers: { 'Retry-After': '50' },
    });
  });

  it('refuses when any one of several limits is exceeded', async () => {
    incr.mockResolvedValueOnce(1).mockResolvedValueOnce(4);

    await expect(
      enforceRateLimits([
        { rule, key: 'ip:203.0.113.7' },
        { rule, key: emailKey('someone@example.com') },
      ]),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('lets the request through when Redis fails (fail open)', async () => {
    incr.mockRejectedValue(new Error('The client is offline'));

    await expect(enforceRateLimits([{ rule, key: 'k' }])).resolves.toBeUndefined();
  });
});

describe('emailKey', () => {
  it('never puts the email itself into Redis', () => {
    const key = emailKey('someone@example.com');

    expect(key).toMatch(/^email:[0-9a-f]{64}$/);
    expect(key).not.toContain('someone');
  });
});
