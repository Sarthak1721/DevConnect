/**
 * Password rules, following NIST SP 800-63B-4 (section 3.1.1.2):
 *
 *  - Length is what counts: at least 15 characters (the minimum when a password is the only login
 *    factor), at most 128. Characters are Unicode code points, so "é" and "🔒" count once each.
 *  - No composition rules ("must contain a digit and a symbol"). They make passwords harder to
 *    remember, not harder to guess: people answer them with "Password1!".
 *  - Reject passwords that are commonly used, expected, or specific to the person or the site.
 *
 * Why patterns instead of a list of common passwords? Common-password lists are made of short
 * passwords. In the 49,233-entry list that zxcvbn-ts ships (@zxcvbn-ts/language-common 4.2.0, from
 * Mark Burnett's 10-million-password corpus), only 41 entries have 15 or more characters. Most are
 * keyboard walks ("1qaz2wsx3edc4rfv"), number runs ("123456789987654321") or repetitions
 * ("passwordpassword"): the patterns below. The rest are random-looking strings that bots reused.
 * Checking against real breach data (the Pwned Passwords API) is planned for Phase 12.
 *
 * Shared by the web app (instant feedback while typing) and the API (the actual rule).
 */

export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

/** How many characters must be left once every guessable part has been taken out. */
export const PASSWORD_MIN_UNGUESSABLE = 8;

/** Length as NIST counts it: one per Unicode code point. ("🔒".length is 2 in JavaScript.) */
export function countCharacters(value: string): number {
  return Array.from(value).length;
}

/**
 * Character orders an attacker tries first. Two characters are "adjacent" when they appear next to
 * each other in one of these strings, in either direction, so "dcba" and "0987" count as runs too.
 */
const SEQUENCES = [
  '01234567890', // digits; ends in 0 again because "1234567890" is how people type them
  'abcdefghijklmnopqrstuvwxyz',
  'qwertyuiop', // keyboard rows
  'asdfghjkl',
  'zxcvbnm',
  '1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik9ol0p', // keyboard columns, top to bottom
  'zaq1xsw2cde3vfr4bgt5nhy6mju7', // keyboard columns, bottom to top
  '1q2w3e4r5t6y7u8i9o0p', // zig-zags between the top two rows
  'q1w2e3r4t5y6u7i8o9p0',
  '!@#$%^&*()', // the digit row with Shift held
];

const ADJACENT_PAIRS = new Set(
  SEQUENCES.flatMap((sequence) => {
    const chars = Array.from(sequence);
    return chars.slice(1).flatMap((char, i) => [`${chars[i]}${char}`, `${char}${chars[i]}`]);
  }),
);

/** Words that mean "password", or name this site. Matched even when spelled "p@ssw0rd". */
const COMMON_WORDS = [
  'password',
  'letmein',
  'iloveyou',
  'welcome',
  'changeme',
  'secret',
  'admin',
  'login',
  'trustno1',
  'devconnect',
];

/** Common look-alike substitutions, undone before words are matched. */
const LOOK_ALIKES: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/** Details about the person, which their password shouldn't be built from. */
export type PasswordContext = {
  username?: string;
  email?: string;
  name?: string;
};

/**
 * Returns what is wrong with a password, or undefined if it's acceptable.
 *
 * The guessability rule works like this: mark every character that belongs to something an
 * attacker tries early (runs of 3+ adjacent or repeated characters, the common words above, and
 * the person's own name, username and email), then require at least PASSWORD_MIN_UNGUESSABLE
 * unmarked characters. "correct horse battery staple" keeps all 28; "devconnect123456" keeps 0.
 */
export function findPasswordProblem(
  password: string,
  context: PasswordContext = {},
): string | undefined {
  const length = countCharacters(password);
  if (length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;

  // One entry per code point, lower-cased, so positions line up across the checks below.
  const chars = Array.from(password, (char) => char.toLowerCase());

  // "monkeymonkeymonkey", "hello123hello123": one short piece, repeated.
  if (/^([\s\S]+?)\1+$/u.test(chars.join(''))) return 'Avoid repeating the same word or pattern.';

  const guessable = chars.map(() => false);
  markRuns(chars, guessable);
  markRepeats(chars, guessable);

  const plain = chars.map((char) => LOOK_ALIKES[char] ?? char);
  for (const word of [...COMMON_WORDS, ...contextWords(context)]) {
    markWord(
      plain,
      Array.from(word, (char) => LOOK_ALIKES[char] ?? char),
      guessable,
    );
  }

  const unguessable = guessable.filter((isGuessable) => !isGuessable).length;
  if (unguessable < PASSWORD_MIN_UNGUESSABLE) {
    return (
      'Too easy to guess. Leave out your name, username and email, words like "password", ' +
      'keyboard patterns like "qwerty", runs like "12345", and repeated characters.'
    );
  }
  return undefined;
}

/** Marks runs of 3 or more characters where each one repeats or is adjacent to the previous one. */
function markRuns(chars: string[], guessable: boolean[]): void {
  let start = 0;
  for (let i = 1; i <= chars.length; i += 1) {
    const previous = chars[i - 1];
    const current = chars[i];
    const continues =
      current !== undefined &&
      (current === previous || ADJACENT_PAIRS.has(`${previous}${current}`));
    if (continues) continue;
    if (i - start >= 3) guessable.fill(true, start, i);
    start = i;
  }
}

/**
 * Marks a chunk of 3+ characters that repeats the chunk right before it: in "4208420842085555"
 * the second and third "4208" are free for an attacker who has guessed the first.
 */
function markRepeats(chars: string[], guessable: boolean[]): void {
  for (let start = 0; start < chars.length; start += 1) {
    for (let size = 3; start + 2 * size <= chars.length; size += 1) {
      let repeats = true;
      for (let offset = 0; offset < size && repeats; offset += 1) {
        repeats = chars[start + offset] === chars[start + size + offset];
      }
      if (repeats) guessable.fill(true, start + size, start + 2 * size);
    }
  }
}

/** Marks every occurrence of `word` (both given as one entry per code point). */
function markWord(chars: string[], word: string[], guessable: boolean[]): void {
  if (word.length === 0) return;
  for (let start = 0; start + word.length <= chars.length; start += 1) {
    if (word.every((char, offset) => chars[start + offset] === char)) {
      guessable.fill(true, start, start + word.length);
    }
  }
}

/** "sarthak.k@example.com" → sarthak.k, sarthak; "Sarthak Kankarej" → sarthak kankarej, sarthak, kankarej. */
function contextWords({ username, email, name }: PasswordContext): string[] {
  const words = new Set<string>();
  for (const value of [username, email?.split('@')[0], name]) {
    if (!value) continue;
    const lower = value.toLowerCase();
    words.add(lower);
    for (const part of lower.split(/[^\p{L}\p{N}]+/u)) words.add(part);
  }
  return [...words].filter((word) => countCharacters(word) >= 3);
}
