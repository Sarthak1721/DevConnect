import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as repo from './auth.repository';
import { login } from './auth.service';
import * as password from './password';

// Unit test of the login decision logic, with the database and Argon2 replaced by fakes. It checks
// something a timing measurement in an integration test couldn't pin down reliably: an unknown
// email costs the same Argon2 work as a wrong password.
vi.mock('./auth.repository');
vi.mock('./password');

const findUserByEmail = vi.mocked(repo.findUserByEmail);
const verifyPassword = vi.mocked(password.verifyPassword);
const verifyAgainstDummyHash = vi.mocked(password.verifyAgainstDummyHash);

const input = { email: 'someone@example.com', password: 'correct horse battery staple' };
const storedUser = {
  id: '019a8e2f-5c3b-7d2e-9f10-2b3c4d5e6f70',
  username: 'someone',
  name: 'Some One',
  email: input.email,
  avatarUrl: null,
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
};

describe('login', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    verifyAgainstDummyHash.mockResolvedValue(false);
  });

  it('runs a full Argon2 verification even when the email is unknown', async () => {
    findUserByEmail.mockResolvedValue(undefined);

    const result = await login(input, null);

    expect(result).toEqual({ ok: false, reason: 'unknown_email' });
    expect(verifyAgainstDummyHash).toHaveBeenCalledExactlyOnceWith(input.password);
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('verifies against the stored hash when the email is known', async () => {
    findUserByEmail.mockResolvedValue(storedUser);
    verifyPassword.mockResolvedValue(false);

    const result = await login(input, null);

    expect(result).toEqual({ ok: false, reason: 'wrong_password', userId: storedUser.id });
    expect(verifyPassword).toHaveBeenCalledExactlyOnceWith(storedUser.passwordHash, input.password);
    expect(verifyAgainstDummyHash).not.toHaveBeenCalled();
  });
});
