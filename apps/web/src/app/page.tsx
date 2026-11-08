import { ApiStatus } from '@/components/api-status';

// Placeholder home page for Phase 1. The real landing page is built in Phase 14.
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <p className="font-mono text-sm text-muted">~/devconnect · phase 1 of 19</p>

      <div className="space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight">DevConnect</h1>
        <p className="text-lg leading-relaxed text-muted">
          A home for developers to show their work: a profile, their GitHub projects and a feed of
          what they are building.
        </p>
      </div>

      <ApiStatus />

      <p className="text-sm leading-relaxed text-muted">
        This page checks the full request path: your browser calls{' '}
        <code className="font-mono text-ink">/api/v1/health</code> on this site, Next.js forwards it
        to the Express API, and the answer comes back here.
      </p>
    </main>
  );
}
