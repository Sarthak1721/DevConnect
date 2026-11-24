import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  loginRequestSchema,
  nameSchema,
  newPasswordSchema,
  registerRequestSchema,
  usernameSchema,
} from './auth';

/** The messages of every issue, for compact assertions. */
function messages(result: { error?: { issues: { message: string }[] } }): string[] {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('emailSchema', () => {
  it('trims and lower-cases before validating', () => {
    expect(emailSchema.parse('  Sarthak.K@Example.COM ')).toBe('sarthak.k@example.com');
  });

  it.each(['', 'not-an-email', 'two@@example.com', 'spaces in@example.com'])(
    'rejects %j',
    (value) => {
      expect(emailSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('usernameSchema', () => {
  it('lower-cases what the user typed', () => {
    expect(usernameSchema.parse('Sarthak-Dev')).toBe('sarthak-dev');
  });

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(31)],
    ['leading hyphen', '-dev'],
    ['trailing hyphen', 'dev-'],
    ['double hyphen', 'a--b'],
    ['underscore', 'sarthak_k'],
    ['space', 'sarthak k'],
  ])('rejects a username with %s', (_reason, value) => {
    expect(usernameSchema.safeParse(value).success).toBe(false);
  });

  it.each(['admin', 'Support', 'devconnect', 'settings'])(
    'rejects the reserved name %j',
    (value) => {
      expect(messages(usernameSchema.safeParse(value))).toEqual([
        'This username is reserved. Please choose another one.',
      ]);
    },
  );
});

describe('nameSchema', () => {
  it('trims the name', () => {
    expect(nameSchema.parse('  Sarthak Kankarej  ')).toBe('Sarthak Kankarej');
  });

  it('counts characters the way the database does (code points)', () => {
    expect(nameSchema.safeParse('😀'.repeat(50)).success).toBe(true);
    expect(nameSchema.safeParse('😀'.repeat(51)).success).toBe(false);
  });

  it.each(['', '   ', 'line\nbreak'])('rejects %j', (value) => {
    expect(nameSchema.safeParse(value).success).toBe(false);
  });
});

describe('newPasswordSchema', () => {
  it('keeps spaces (passwords are never trimmed)', () => {
    expect(newPasswordSchema.parse('  correct horse battery staple  ')).toBe(
      '  correct horse battery staple  ',
    );
  });

  it('normalises to NFKC, so the same password typed two ways is the same string', () => {
    const composed = 'café au lait at dawn'; // é as one code point
    const decomposed = 'café au lait at dawn'; // e + combining accent
    expect(composed).not.toBe(decomposed);
    expect(newPasswordSchema.parse(decomposed)).toBe(newPasswordSchema.parse(composed));
  });

  it('reports one problem at a time', () => {
    expect(messages(newPasswordSchema.safeParse('short'))).toEqual(['Use at least 15 characters.']);
  });
});

describe('registerRequestSchema', () => {
  const valid = {
    name: 'Sarthak Kankarej',
    username: 'sarthak',
    email: 'sarthak@example.com',
    password: 'correct horse battery staple',
  };

  it('accepts and normalises a valid registration', () => {
    expect(registerRequestSchema.parse({ ...valid, username: 'Sarthak' })).toEqual(valid);
  });

  it('rejects a password built from the other fields, on the password field', () => {
    const result = registerRequestSchema.safeParse({ ...valid, password: 'sarthak-kankarej-2026' });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0]?.path).toEqual(['password']);
    expect(result.error?.issues[0]?.message).toMatch(/^Too easy to guess/);
  });

  it('reports every invalid field at once', () => {
    const result = registerRequestSchema.safeParse({ name: '', username: 'a', email: 'x' });

    const paths = result.error?.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(['name', 'username', 'email', 'password']);
  });
});

describe('loginRequestSchema', () => {
  it('does not apply the strength rules to an existing password', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@example.com', password: 'x' }).success).toBe(
      true,
    );
  });

  it('requires a password', () => {
    expect(
      messages(loginRequestSchema.safeParse({ email: 'a@example.com', password: '' })),
    ).toEqual(['Enter your password.']);
  });
});
