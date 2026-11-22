import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId, updatedAt } from './columns';

/**
 * users: identity plus the small "card" fields shown next to every post.
 * Kept narrow on purpose: it is read on almost every request (auth checks, post cards),
 * while the bigger profile content lives in `profiles`.
 *
 * CHECK constraints are the last line of defence. The API validates first (with friendly error
 * messages); the database guarantees the rules hold whatever code path writes the row.
 */
export const users = pgTable(
  'users',
  {
    id: primaryId(),
    // Stored lower-case (enforced below), so one plain UNIQUE index makes emails case-insensitive.
    email: text('email').notNull(),
    username: text('username').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    avatarUrl: text('avatar_url'),
    avatarPublicId: text('avatar_public_id'),
    // Maintained by triggers (migration 0002), never written by the API.
    followerCount: integer('follower_count').notNull().default(0),
    followingCount: integer('following_count').notNull().default(0),
    postCount: integer('post_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    uniqueIndex('users_username_key').on(t.username),
    check(
      'users_email_valid',
      sql`char_length(${t.email}) <= 254 and ${t.email} = lower(${t.email}) and ${t.email} ~ '^[^@[:space:]]+@[^@[:space:]]+$'`,
    ),
    // 3–30 characters: lower-case letters and digits in groups joined by single hyphens.
    // Rules out "-dev", "dev-", "a--b" and upper case, so the username is safe in URLs (/u/:username).
    // The 3-character minimum also makes "me" impossible, which GET /users/me relies on.
    // Reserved words (admin, support, ...) are policy and live in the API's validation (Phase 3).
    check(
      'users_username_format',
      sql`char_length(${t.username}) between 3 and 30 and ${t.username} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
    check(
      'users_name_valid',
      sql`char_length(${t.name}) between 1 and 50 and ${t.name} !~ '^[[:space:]]|[[:space:]]$'`,
    ),
    check('users_avatar_url_https', sql`${t.avatarUrl} ~ '^https://'`),
    check(
      'users_avatar_fields_together',
      sql`(${t.avatarUrl} is null) = (${t.avatarPublicId} is null)`,
    ),
    check(
      'users_counts_non_negative',
      sql`${t.followerCount} >= 0 and ${t.followingCount} >= 0 and ${t.postCount} >= 0`,
    ),
    // Trigram indexes for people search ("similar to" matching, Phase 11). Needs pg_trgm (migration 0000).
    index('users_username_trgm_idx').using('gin', t.username.op('gin_trgm_ops')),
    index('users_name_trgm_idx').using('gin', t.name.op('gin_trgm_ops')),
  ],
);

/** Shapes stored in the profile's JSONB columns. Phase 4 adds the Zod schemas that validate them. */
export type SocialLinks = Partial<Record<'github' | 'linkedin' | 'x' | 'website', string>>;

export interface ExperienceEntry {
  title: string;
  company: string;
  startDate: string; // YYYY-MM
  endDate: string | null; // null = current role
  description?: string;
}

export interface EducationEntry {
  school: string;
  degree: string;
  startYear: number;
  endYear: number | null;
}

/**
 * profiles: one row per user (1:1, the primary key is also the foreign key).
 * Experience and education are JSONB: they belong to one profile, are always read and written as a
 * whole and never queried across users. Rule of thumb: normalize what you query, embed what you display.
 */
export const profiles = pgTable(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    headline: text('headline'),
    bio: text('bio'),
    location: text('location'),
    portfolioUrl: text('portfolio_url'),
    socialLinks: jsonb('social_links').$type<SocialLinks>().notNull().default({}),
    experience: jsonb('experience').$type<ExperienceEntry[]>().notNull().default([]),
    education: jsonb('education').$type<EducationEntry[]>().notNull().default([]),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('profiles_headline_length', sql`char_length(${t.headline}) <= 120`),
    check('profiles_bio_length', sql`char_length(${t.bio}) <= 2000`),
    check('profiles_location_length', sql`char_length(${t.location}) <= 100`),
    check(
      'profiles_portfolio_url_valid',
      sql`char_length(${t.portfolioUrl}) <= 2048 and ${t.portfolioUrl} ~ '^https?://'`,
    ),
    check('profiles_social_links_is_object', sql`jsonb_typeof(${t.socialLinks}) = 'object'`),
    // CASE, not AND: SQL doesn't promise to evaluate AND left to right, and jsonb_array_length()
    // throws on anything that isn't an array.
    check(
      'profiles_experience_max_20',
      sql`case when jsonb_typeof(${t.experience}) = 'array' then jsonb_array_length(${t.experience}) <= 20 else false end`,
    ),
    check(
      'profiles_education_max_20',
      sql`case when jsonb_typeof(${t.education}) = 'array' then jsonb_array_length(${t.education}) <= 20 else false end`,
    ),
  ],
);
