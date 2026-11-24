'use client';

import type { AuthUser } from '@devconnect/shared';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useSession } from '@/hooks/use-session';

/**
 * Guards a page that needs a signed-in user. While the session is being restored it shows a
 * placeholder; without a session it sends the visitor to /login, remembering where they were.
 *
 * This is about user experience, not security: the protection is on the API, which refuses
 * every request without a valid access token. Hiding a page in the browser protects nothing.
 */
export function RequireAuth({ children }: { children: (user: AuthUser) => ReactNode }) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === 'anonymous') {
      const here = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(here)}`);
    }
  }, [session.status, router]);

  if (session.status !== 'authenticated') {
    return (
      <p role="status" className="font-mono text-sm text-muted">
        Checking your session…
      </p>
    );
  }
  return children(session.user);
}
