import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from './columns';
import { users } from './users';

/**
 * skills: a shared vocabulary ("TypeScript", "PostgreSQL", ...).
 * Normalized into its own table because we search and filter by skill (Phase 11).
 */
export const skills = pgTable(
  'skills',
  {
    id: primaryId(),
    name: text('name').notNull(), // display form: "Node.js"
    slug: text('slug').notNull(), // URL/lookup form: "node-js"
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('skills_slug_key').on(t.slug),
    check('skills_name_length', sql`char_length(${t.name}) between 1 and 40`),
    check(
      'skills_slug_format',
      sql`char_length(${t.slug}) <= 40 and ${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
    index('skills_name_trgm_idx').using('gin', t.name.op('gin_trgm_ops')), // autocomplete
  ],
);

/**
 * user_skills: which user has which skill, and in what display order (many-to-many).
 *
 * At most 20 skills per user, enforced without a trigger: `position` must be 0–19 and is unique
 * per user, so 20 distinct positions allow at most 20 rows (the pigeonhole principle).
 */
export const userSkills = pgTable(
  'user_skills',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
  },
  (t) => [
    primaryKey({ name: 'user_skills_pkey', columns: [t.userId, t.skillId] }),
    uniqueIndex('user_skills_user_position_key').on(t.userId, t.position),
    check('user_skills_position_range', sql`${t.position} between 0 and 19`),
    // "Users with skill X" (search filter) and fast cascades when a skill is deleted.
    index('user_skills_skill_idx').on(t.skillId),
  ],
);
