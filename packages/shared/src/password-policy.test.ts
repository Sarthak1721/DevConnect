import { describe, expect, it } from 'vitest';
import { countCharacters, findPasswordProblem } from './password-policy';

describe('countCharacters', () => {
  it('counts Unicode code points, not UTF-16 units', () => {
    expect('🔒'.length).toBe(2);
    expect(countCharacters('🔒')).toBe(1);
    expect(countCharacters('Grüße')).toBe(5);
  });
});

describe('findPasswordProblem: length', () => {
  it('requires at least 15 characters', () => {
    expect(findPasswordProblem('fourteen chars')).toBe('Use at least 15 characters.');
  });

  it('counts an emoji as one character', () => {
    // 14 letters + 1 emoji = 15 code points (16 UTF-16 units).
    expect(findPasswordProblem('mylockerpinxyz🔒')).toBeUndefined();
  });

  it('allows at most 128 characters', () => {
    const words = 'violet anchor museum drizzle '; // 29 characters, repeated: not one repeated piece
    const long = `${words.repeat(4)}hammock kettle`.slice(0, 129);
    expect(countCharacters(long)).toBe(129);
    expect(findPasswordProblem(long)).toBe('Use at most 128 characters.');
  });
});

describe('findPasswordProblem: guessable passwords', () => {
  it.each([
    'correct horse battery staple',
    'Pune2026!monsoon-rains',
    'lets meet upon the street', // short runs inside words ("pon", "stree") are fine
    'my devconnect account password', // contains common words, but they're not most of it
    'kzpqxmvbtrwlnhj',
    'Grüße aus München 2026',
  ])('accepts %j', (password) => {
    expect(findPasswordProblem(password)).toBeUndefined();
  });

  it.each([
    ['a keyboard row', 'qwertyuiopasdfgh'],
    ['keyboard columns', '1qaz2wsx3edc4rfv'],
    ['keyboard columns, backwards', 'zaq12wsxcde34rfv'],
    ['a zig-zag across two rows', 'q1w2e3r4t5y6u7i8'],
    ['the alphabet', 'abcdefghijklmnop'],
    ['digits up and down', '123456789987654321'],
    ['the shifted digit row', '!@#$%^&*()!@#$%^'],
    ['repeated groups', '420842084208555'],
    ['the site name plus digits', 'devconnect123456'],
    ['"password" plus a run', 'mypassword12345!'],
    ['look-alike spelling', 'p@ssw0rd-p@ssw0rd!'],
    ['a welcome phrase', 'welcome to devconnect'],
  ])('rejects %s (%j)', (_pattern, password) => {
    expect(findPasswordProblem(password)).toMatch(/^Too easy to guess/);
  });

  it.each(['passwordpassword', 'monkeymonkeymonkey', 'aaaaaaaaaaaaaaaa'])(
    'rejects one piece repeated (%j) with a specific message',
    (password) => {
      expect(findPasswordProblem(password)).toBe('Avoid repeating the same word or pattern.');
    },
  );
});

describe('findPasswordProblem: context', () => {
  it('rejects a password built from the username', () => {
    expect(findPasswordProblem('sarthak-devconnect-2026')).toBeUndefined();
    expect(findPasswordProblem('sarthak-devconnect-2026', { username: 'sarthak' })).toMatch(
      /^Too easy to guess/,
    );
  });

  it('rejects a password built from parts of the email address', () => {
    const context = { email: 'sarthak.kankarej1721@example.com' };
    expect(findPasswordProblem('kankarej1721 is my secret', context)).toMatch(/^Too easy/);
  });

  it('rejects a password built from the name, ignoring case', () => {
    const context = { name: 'Sarthak Kankarej' };
    expect(findPasswordProblem('SARTHAK kankarej rocks!', context)).toMatch(/^Too easy/);
  });

  it('accepts a password that merely mentions the name', () => {
    const context = { name: 'Sarthak Kankarej', username: 'sarthak' };
    expect(findPasswordProblem('sarthak loves trekking in the sahyadris', context)).toBeUndefined();
  });
});
