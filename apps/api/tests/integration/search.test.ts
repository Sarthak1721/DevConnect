import { desc, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/client';
import { posts, users } from '../../src/db/schema';
import { resetDatabase } from '../helpers/db';
import { createPost, createUser } from '../helpers/factories';

// A first look at the two search techniques Phase 11 builds on, proving the database side
// (generated column, extension, operators) works.
beforeEach(resetDatabase);

describe('full-text search on posts', () => {
  it('matches word roots, not exact strings', async () => {
    const author = await createUser();
    await createPost(author.id, { content: 'I was running benchmarks on Postgres all night' });
    await createPost(author.id, { content: 'Cooking pasta tonight' });

    // websearch_to_tsquery accepts what people type into search boxes ("run benchmark").
    const query = sql`websearch_to_tsquery('english', ${'run benchmark'})`;
    const rows = await db
      .select({ content: posts.content })
      .from(posts)
      .where(sql`${posts.searchVector} @@ ${query}`);

    expect(rows).toEqual([{ content: 'I was running benchmarks on Postgres all night' }]);
  });
});

describe('trigram search on usernames', () => {
  it('ranks similar usernames first, tolerating typos', async () => {
    await createUser({ username: 'sarthak-dev' });
    await createUser({ username: 'sara-k' });
    await createUser({ username: 'linus' });

    // similarity() compares the sets of 3-letter chunks of both strings (0 = nothing in common).
    const similarity = sql<number>`similarity(${users.username}, ${'sarthk'})`;
    const rows = await db
      .select({ username: users.username, similarity })
      .from(users)
      .where(sql`${similarity} > 0.2`)
      .orderBy(desc(similarity));

    expect(rows[0]?.username).toBe('sarthak-dev');
    expect(rows.map((row) => row.username)).not.toContain('linus');
  });
});
