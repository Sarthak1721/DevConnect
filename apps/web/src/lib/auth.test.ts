import { describe, expect, it } from 'vitest';
import { safeNextPath } from './auth';

const origin = 'http://localhost:3000';

describe('safeNextPath', () => {
  it.each([
    ['?next=/feed', '/feed'],
    ['?next=/u/ada?tab=posts#top', '/u/ada?tab=posts#top'],
    ['?next=%2Fsettings', '/settings'],
  ])('keeps a page of this site: %s → %s', (search, expected) => {
    expect(safeNextPath(search, origin)).toBe(expected);
  });

  it.each([
    ['no next at all', ''],
    ['another site', '?next=https://evil.example/login'],
    ['a protocol-relative URL', '?next=//evil.example'],
    ['a backslash browsers read as a slash', '?next=/%5Cevil.example'],
    ['a tab that URL parsing removes', '?next=/%09/evil.example'],
    ['a javascript: URL', '?next=javascript:alert(document.cookie)'],
    ['something that is not a URL', '?next=http://[not-a-host'],
  ])('falls back to /feed for %s', (_case, search) => {
    expect(safeNextPath(search, origin)).toBe('/feed');
  });
});
