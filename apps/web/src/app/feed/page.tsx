import type { Metadata } from 'next';
import Link from 'next/link';
import { FeedPlaceholder } from '@/components/feed-placeholder';

export const metadata: Metadata = { title: 'Your feed' };

export default function FeedPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <Link href="/" className="font-mono text-sm text-muted hover:text-ink">
        ~/devconnect
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight">Your feed</h1>
      <FeedPlaceholder />
    </main>
  );
}
