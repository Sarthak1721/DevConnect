import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Shared frame of the sign-in and sign-up pages. "(auth)" is a route group: the parentheses keep
 * it out of the URL (the pages live at /login and /register), it only groups them under this layout.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-16">
      <Link href="/" className="font-mono text-sm text-muted hover:text-ink">
        ~/devconnect
      </Link>
      {children}
    </main>
  );
}
