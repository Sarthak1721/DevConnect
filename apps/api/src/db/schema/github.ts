import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId, timestamptz, updatedAt } from './columns';
import { users } from './users';

/**
 * github_accounts: the GitHub account a user linked (Phase 5), at most one per user.
 * Its own table (not columns on users) because most users won't link one, and the sync state
 * changes often.
 */
export const githubAccounts = pgTable(
  'github_accounts',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    // GitHub's numeric id never changes; the login (username) can.
    githubUserId: bigint('github_user_id', { mode: 'number' }).notNull(),
    login: text('login').notNull(),
    avatarUrl: text('avatar_url'),
    // ETag from the last repo list response: lets the next sync ask "changed since?" and get
    // a cheap 304 Not Modified.
    reposEtag: text('repos_etag'),
    // text + CHECK instead of a Postgres enum: easy to extend later (see docs/adr/0009).
    syncStatus: text('sync_status', { enum: ['pending', 'ok', 'error'] })
      .notNull()
      .default('pending'),
    lastSyncedAt: timestamptz('last_synced_at'),
    lastSyncError: text('last_sync_error'),
    createdAt: createdAt(), // when the account was linked
    updatedAt: updatedAt(),
  },
  (t) => [
    // One GitHub account can be linked to only one DevConnect user.
    uniqueIndex('github_accounts_github_user_id_key').on(t.githubUserId),
    check('github_accounts_login_length', sql`char_length(${t.login}) between 1 and 39`),
    check('github_accounts_sync_status_valid', sql`${t.syncStatus} in ('pending', 'ok', 'error')`),
    check('github_accounts_avatar_url_https', sql`${t.avatarUrl} ~ '^https://'`),
    check('github_accounts_last_sync_error_length', sql`char_length(${t.lastSyncError}) <= 500`),
  ],
);

/**
 * github_repositories: a snapshot of a linked account's public repos, refreshed by each sync.
 * Profile pages read this table instead of calling GitHub on every page view.
 */
export const githubRepositories = pgTable(
  'github_repositories',
  {
    id: primaryId(),
    // Points at github_accounts, so unlinking GitHub removes the snapshot too.
    userId: uuid('user_id')
      .notNull()
      .references(() => githubAccounts.userId, { onDelete: 'cascade' }),
    githubRepoId: bigint('github_repo_id', { mode: 'number' }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    htmlUrl: text('html_url').notNull(),
    language: text('language'),
    stargazersCount: integer('stargazers_count').notNull().default(0),
    forksCount: integer('forks_count').notNull().default(0),
    isFork: boolean('is_fork').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    isPinned: boolean('is_pinned').notNull().default(false),
    pushedAt: timestamptz('pushed_at'),
  },
  (t) => [
    // Sync upserts by (user_id, github_repo_id); the leading user_id also serves "this user's repos".
    uniqueIndex('github_repositories_user_repo_key').on(t.userId, t.githubRepoId),
    check('github_repositories_html_url_github', sql`${t.htmlUrl} like 'https://github.com/%'`),
    check(
      'github_repositories_counts_non_negative',
      sql`${t.stargazersCount} >= 0 and ${t.forksCount} >= 0`,
    ),
  ],
);
