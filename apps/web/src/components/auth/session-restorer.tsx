'use client';

import { useEffect } from 'react';
import { restoreSession } from '@/lib/session';

/**
 * Mounted once, in the root layout: on every full page load, try to turn the refresh cookie back
 * into a session (the in-memory access token didn't survive the reload). Renders nothing.
 */
export function SessionRestorer() {
  useEffect(() => {
    void restoreSession();
  }, []);
  return null;
}
