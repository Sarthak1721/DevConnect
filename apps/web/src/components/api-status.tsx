'use client';

import { apiSuccessSchema, healthStatusSchema, type HealthStatus } from '@devconnect/shared';
import { useEffect, useState } from 'react';

type Status =
  | { state: 'checking' }
  | { state: 'online'; health: HealthStatus }
  | { state: 'offline'; reason: string };

const healthResponseSchema = apiSuccessSchema(healthStatusSchema);

/**
 * Calls GET /api/v1/health from the browser. The request goes to THIS origin (Next.js),
 * which forwards it to the Express API, so a green dot proves the whole chain works:
 * browser → Next.js rewrite → Express → back.
 */
export function ApiStatus() {
  const [status, setStatus] = useState<Status>({ state: 'checking' });

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      try {
        const response = await fetch('/api/v1/health', {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) {
          // When the API isn't running, the Next.js proxy itself answers with a 5xx.
          setStatus({ state: 'offline', reason: `HTTP ${response.status}` });
          return;
        }
        // Validate the response at runtime with the same schema the API is typed against.
        const parsed = healthResponseSchema.safeParse(await response.json());
        if (!parsed.success) {
          setStatus({ state: 'offline', reason: 'unexpected response shape' });
          return;
        }
        setStatus({ state: 'online', health: parsed.data.data });
      } catch {
        if (controller.signal.aborted) return; // the component unmounted: ignore
        setStatus({ state: 'offline', reason: 'network error' });
      }
    }

    void checkHealth();
    // Cancel the request if the component unmounts before it finishes.
    return () => controller.abort();
  }, []);

  const dotColour = {
    checking: 'bg-muted',
    online: 'bg-success',
    offline: 'bg-danger',
  }[status.state];

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 font-mono text-sm"
    >
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${dotColour}`} />
      {status.state === 'checking' && <span>Checking the API…</span>}
      {status.state === 'online' && (
        <span>API online · up {formatUptime(status.health.uptimeSeconds)}</span>
      )}
      {status.state === 'offline' && (
        <span>
          API offline · {status.reason} · is <code>pnpm dev:api</code> running?
        </span>
      )}
    </div>
  );
}

function formatUptime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
