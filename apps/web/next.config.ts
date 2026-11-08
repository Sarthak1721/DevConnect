import type { NextConfig } from 'next';

/**
 * Where the Express API runs. The browser never calls it directly: it calls /api/* on this
 * Next.js origin and Next.js forwards the request (the rewrite below). That keeps cookies
 * first-party and removes the need for CORS in the browser.
 *
 * Rewrites are compiled into the build output, so API_ORIGIN must be set before `next build`.
 */
const apiOrigin = new URL(process.env.API_ORIGIN ?? 'http://localhost:4000').origin;

const nextConfig: NextConfig = {
  // Next.js 16's explicit caching model (the create-next-app defaults): pages render
  // dynamically unless a component opts into caching with the 'use cache' directive.
  cacheComponents: true,
  partialPrefetching: true,

  experimental: {
    // During `next dev` / `next build`, warn when the installed Next.js version has a published
    // security advisory (this is Next's default policy, written out so it's visible).
    // When the reminder appears, choose "Skip" and upgrade deliberately, then commit the change.
    agentUpgrade: 'security',
  },

  poweredByHeader: false,

  // Tailwind CSS v4 compiled natively by Turbopack.
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },

  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
