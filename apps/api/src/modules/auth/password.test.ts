import { hash } from 'argon2';
import { describe, expect, it } from 'vitest';
import { SEED_PASSWORD_HASH } from '../../db/seed/guard';
import { hashPassword, needsUpgrade, verifyAgainstDummyHash, verifyPassword } from './password';

describe('password hashing (Argon2id)', () => {
  it('produces a self-describing hash with our parameters and a random salt', async () => {
    const first = await hashPassword('correct horse battery staple');
    const second = await hashPassword('correct horse battery staple');

    expect(first).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
    // Same password, different salt, different hash: equal passwords can't be spotted in a dump.
    expect(first).not.toBe(second);
  });

  it('verifies the right password and refuses a wrong one', async () => {
    const stored = await hashPassword('correct horse battery staple');

    await expect(verifyPassword(stored, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPassword(stored, 'correct horse battery stapler')).resolves.toBe(false);
  });

  it('treats the two Unicode spellings of the same password as equal (NFKC)', async () => {
    const stored = await hashPassword('café au lait at dawn');

    await expect(verifyPassword(stored, 'café au lait at dawn')).resolves.toBe(true);
  });

  it('flags hashes made with other parameters for an upgrade at the next login', async () => {
    const current = await hashPassword('correct horse battery staple');
    const old = await hash('correct horse battery staple', { memoryCost: 4096, timeCost: 3 });

    expect(needsUpgrade(current)).toBe(false);
    expect(needsUpgrade(old)).toBe(true);
  });

  it('accepts the seed accounts’ password (pnpm db:seed users can log in)', async () => {
    await expect(verifyPassword(SEED_PASSWORD_HASH, 'seed-password-for-local-dev')).resolves.toBe(
      true,
    );
    expect(needsUpgrade(SEED_PASSWORD_HASH)).toBe(false);
  });

  it('the dummy check always fails, whatever the password', async () => {
    await expect(verifyAgainstDummyHash('correct horse battery staple')).resolves.toBe(false);
  });
});
