'use client';

import { AccountPanel } from '@/components/auth/account-panel';
import { RequireAuth } from '@/components/auth/require-auth';

/**
 * The feed page's content until Phase 9. A client component because it depends on the session,
 * which only exists in the browser (and because the render function passed to RequireAuth can't
 * cross from a Server Component to a Client Component: functions aren't serialisable).
 */
export function FeedPlaceholder() {
  return <RequireAuth>{(user) => <AccountPanel user={user} />}</RequireAuth>;
}
