/** @type {import('next').NextConfig} */

import { withSentryConfig } from '@sentry/nextjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [],
  },
  // Proxy API calls to backend in development
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript' },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry organisation + project (set via env or hardcode for your project)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Auth token for uploading source maps (keep server-side only)
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload source maps in CI/production builds only
  silent: true,
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements in production
  disableLogger: true,

  // Tunnel Sentry requests through Next.js to avoid ad-blockers
  tunnelRoute: '/monitoring',

  // Automatically wrap API routes and pages with Sentry
  autoInstrumentServerFunctions: true,
  autoInstrumentMiddleware: true,
  autoInstrumentAppDirectory: true,

  // Release tracking — inject git SHA automatically
  release: {
    name: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
    deploy: {
      env: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    },
  },
});
