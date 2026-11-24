'use client';

import { useSyncExternalStore } from 'react';
import { getServerSnapshot, getSnapshot, type SessionState, subscribe } from '@/lib/session';

/**
 * The current session, kept in sync with the store in lib/session.ts.
 *
 * useSyncExternalStore is React's built-in way to read state that lives outside React: it
 * subscribes, re-renders on every change, and uses getServerSnapshot ("loading") during server
 * rendering and hydration, so the server HTML and the browser's first render always match.
 */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
