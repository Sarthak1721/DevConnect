import { z } from 'zod';
import { countCharacters, findPasswordProblem, PASSWORD_MAX_LENGTH } from './password-policy';

/**
 * Validation for the auth endpoints, shared by the web forms (instant feedback) and the API (the
 * rule that actually holds). The database repeats the format rules as CHECK constraints
 * (apps/api/src/db/schema/users.ts); these schemas are where the friendly messages come from.
 *
 * Schemas normalise as they validate (trim, lower-case), so the API stores exactly what it checked.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const NAME_MAX_LENGTH = 50;
export const EMAIL_MAX_LENGTH = 254;

/**
 * Usernames nobody may register. Some look like staff or the platform itself (an impersonation
 * risk); the others are words used in URLs, kept free in case profiles ever move from /u/:username
 * to /:username. "me" needs no entry: the 3-character minimum already rules it out.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'abuse',
  'admin',
  'administrator',
  'devconnect',
  'help',
  'helpdesk',
  'hostmaster',
  'mod',
  'moderator',
  'no-reply',
  'noreply',
  'official',
  'postmaster',
  'root',
  'security',
  'staff',
  'support',
  'sysadmin',
  'system',
  'team',
  'webmaster',
  'about',
  'account',
  'anonymous',
  'api',
  'app',
  'auth',
  'blog',
  'docs',
  'edit',
  'everyone',
  'explore',
  'feed',
  'login',
  'logout',
  'mail',
  'messages',
  'new',
  'notifications',
  'null',
  'posts',
  'privacy',
  'profile',
  'register',
  'search',
  'settings',
  'signin',
  'signup',
  'status',
  'terms',
  'undefined',
  'user',
  'users',
  'www',
]);

/** Trimmed and lower-cased before it's checked: "  Sarthak@Example.com " is stored as "sarthak@example.com". */
export const emailSchema = z
  .string({ error: 'Enter your email address.' })
  .trim()
  .toLowerCase()
  .min(1, { error: 'Enter your email address.' })
  .max(EMAIL_MAX_LENGTH, { error: `Use at most ${EMAIL_MAX_LENGTH} characters.` })
  .pipe(z.email({ error: 'Enter a valid email address.' }));

/** Lower-cased for the user ("Sarthak" becomes "sarthak"): profile URLs are /u/<username>. */
export const usernameSchema = z
  .string({ error: 'Choose a username.' })
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN_LENGTH, { error: `Use at least ${USERNAME_MIN_LENGTH} characters.` })
  .max(USERNAME_MAX_LENGTH, { error: `Use at most ${USERNAME_MAX_LENGTH} characters.` })
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    error: 'Use letters, digits and single hyphens, with no hyphen at the start or end.',
  })
  .refine((username) => !RESERVED_USERNAMES.has(username), {
    error: 'This username is reserved. Please choose another one.',
  });

/** The display name ("Sarthak Kankarej"). Counted in code points, like the database's char_length. */
export const nameSchema = z
  .string({ error: 'Enter your name.' })
  .trim()
  .refine((name) => countCharacters(name) >= 1, { error: 'Enter your name.', abort: true })
  .refine((name) => countCharacters(name) <= NAME_MAX_LENGTH, {
    error: `Use at most ${NAME_MAX_LENGTH} characters.`,
    abort: true,
  })
  .refine((name) => !/\p{Cc}/u.test(name), { error: 'Remove line breaks and control characters.' });

/**
 * A new password. Never trimmed: spaces are legitimate password characters. NFKC normalisation
 * makes the same password typed on two devices produce the same characters (an "é" can be one
 * code point or two), as NIST recommends; the API hashes the normalised form too.
 */
export const newPasswordSchema = z
  .string({ error: 'Choose a password.' })
  .overwrite((password) => password.normalize('NFKC'))
  .check((ctx) => {
    const problem = findPasswordProblem(ctx.value);
    if (problem) ctx.issues.push({ code: 'custom', message: problem, input: ctx.value });
  });

export const registerRequestSchema = z
  .object({
    name: nameSchema,
    username: usernameSchema,
    email: emailSchema,
    password: newPasswordSchema,
  })
  // Runs only once every field is valid: the password mustn't be built from the other three.
  .check((ctx) => {
    const { password, ...context } = ctx.value;
    const problem = findPasswordProblem(password, context);
    if (problem) {
      ctx.issues.push({ code: 'custom', message: problem, path: ['password'], input: password });
    }
  });

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/**
 * Login checks only that a password was given (and isn't absurdly long). The strength rules apply
 * when a password is chosen; applying them here would only lock people out if the rules change.
 */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: 'Enter your password.' })
    .min(1, { error: 'Enter your password.' })
    .refine((password) => countCharacters(password) <= PASSWORD_MAX_LENGTH, {
      error: `Passwords have at most ${PASSWORD_MAX_LENGTH} characters.`,
    }),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** The signed-in user, as the auth endpoints return it. Includes the email: only ever sent to its owner. */
export const authUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  name: z.string(),
  email: z.string(),
  avatarUrl: z.string().nullable(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

/**
 * Body of a successful register, login or refresh. The refresh token is not in it: it travels only
 * in the HttpOnly cookie, out of JavaScript's reach.
 *
 * expiresIn is relative (seconds, like OAuth's expires_in) rather than a timestamp, so a browser
 * whose clock is wrong still knows when to refresh.
 */
export const authSessionSchema = z.object({
  user: authUserSchema,
  accessToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
});

export type AuthSession = z.infer<typeof authSessionSchema>;

/**
 * Name of the cookie that tells the web app "a refresh cookie exists" (the refresh cookie itself is
 * HttpOnly, so JavaScript can't see it). It holds no secret; see apps/api/src/modules/auth/refresh-cookie.ts.
 */
export const SESSION_HINT_COOKIE_NAME = 'dc_has_session';

/** Body of GET /api/v1/auth/me. */
export const currentUserSchema = z.object({ user: authUserSchema });

export type CurrentUser = z.infer<typeof currentUserSchema>;
