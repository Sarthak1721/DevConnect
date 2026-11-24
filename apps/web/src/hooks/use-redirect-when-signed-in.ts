'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { safeNextPath } from '@/lib/auth';
import { useSession } from './use-session';

/**
 * For the login and register pages: as soon as there is a session (just signed in, or already
 * signed in when the page opened), leave for ?next=... or the feed.
 *
 * The URL is read from window.location inside the effect rather than with useSearchParams():
 * only this effect needs it, and the hook would make Next.js render the page in the browser only.
 */
export function useRedirectWhenSignedIn(): void {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session.status === 'authenticated') {
      router.replace(safeNextPath(window.location.search, window.location.origin));
    }
  }, [session.status, router]);
}
