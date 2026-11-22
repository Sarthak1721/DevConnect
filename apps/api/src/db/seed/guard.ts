import { env } from '../../config/env';

/**
 * Argon2id hash (19 MiB, 2 iterations, parallelism 1: the parameters chosen in Phase 0) of the
 * password every seeded account shares:
 *
 *     seed-password-for-local-dev
 *
 * Public on purpose: seed data is for local development only. Login arrives in Phase 3.
 */
export const SEED_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$8ffMqhBw6xxHMJ9JY0g02Q$kNLmJIUIdt7IUYZbAdR5BQob7wpgPOUdpxGHNhNnJSo';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The seed scripts start by deleting ALL data. Refuse unless the target is clearly a local
 * development database, and say which database it is before touching it.
 */
export function assertLocalDevelopmentDatabase(): string {
  const url = new URL(env.DATABASE_URL);
  const target = `${url.hostname}:${url.port || '5432'}${url.pathname}`;

  if (env.NODE_ENV === 'production') {
    throw new Error('Seed scripts never run with NODE_ENV=production.');
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `Refusing to seed ${target}: seeding deletes all data, so it only runs against a database ` +
        'on this machine (localhost / 127.0.0.1).',
    );
  }
  return target;
}
