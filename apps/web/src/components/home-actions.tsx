'use client';

import Link from 'next/link';
import { useSession } from '@/hooks/use-session';

/** The landing page's calls to action, depending on whether someone is signed in. */
export function HomeActions() {
  const session = useSession();

  if (session.status === 'loading') {
    // Same height as the buttons, so the page doesn't jump when they appear.
    return <div aria-hidden="true" className="h-10" />;
  }

  if (session.status === 'authenticated') {
    return (
      <Link
        href="/feed"
        className="inline-flex h-10 items-center rounded-md bg-accent px-4 font-medium text-white hover:opacity-90"
      >
        Continue as @{session.user.username}
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href="/register"
        className="inline-flex h-10 items-center rounded-md bg-accent px-4 font-medium text-white hover:opacity-90"
      >
        Create an account
      </Link>
      <Link
        href="/login"
        className="inline-flex h-10 items-center rounded-md border border-line px-4 font-medium hover:bg-surface"
      >
        Sign in
      </Link>
    </div>
  );
}
