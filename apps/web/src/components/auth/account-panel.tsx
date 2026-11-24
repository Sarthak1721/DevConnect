'use client';

import type { AuthUser } from '@devconnect/shared';
import { useState } from 'react';
import { logout, logoutEverywhere } from '@/lib/auth';

/** Who is signed in, plus the two ways to sign out. A placeholder until the real feed (Phase 9). */
export function AccountPanel({ user }: { user: AuthUser }) {
  const [pending, setPending] = useState<'logout' | 'everywhere' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: 'logout' | 'everywhere') {
    setPending(action);
    setError(null);
    try {
      // Ends the session in the store; RequireAuth (around this page) then leaves for /login.
      await (action === 'logout' ? logout() : logoutEverywhere());
    } catch {
      setError('Signing out failed. Please try again.');
      setPending(null);
    }
  }

  return (
    <section className="space-y-6 rounded-lg border border-line bg-surface p-6">
      <div className="space-y-1">
        <p className="text-sm text-muted">Signed in as</p>
        <p className="text-xl font-semibold">{user.name}</p>
        <p className="font-mono text-sm text-muted">
          @{user.username} · {user.email}
        </p>
      </div>

      <p className="text-sm leading-relaxed text-muted">
        Your feed arrives in Phase 9. For now this page proves the session works: reload it and you
        stay signed in, thanks to the refresh cookie.
      </p>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void run('logout')}
          disabled={pending !== null}
          className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-canvas focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
        >
          {pending === 'logout' ? 'Signing out…' : 'Sign out'}
        </button>
        <button
          type="button"
          onClick={() => void run('everywhere')}
          disabled={pending !== null}
          className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:bg-canvas focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
        >
          {pending === 'everywhere' ? 'Signing out everywhere…' : 'Sign out on all devices'}
        </button>
      </div>
    </section>
  );
}
