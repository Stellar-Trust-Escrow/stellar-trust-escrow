/** @type {import('next').NextConfig} */

import { withSentryConfig } from '@sentry/nextjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

// Only enforce strictly in production
if (!API_URL && process.env.NODE_ENV === 'production') {
  throw new Error('NEXT_PUBLIC_API_URL is not defined');
}

// Fallback for dev/CI
const resolvedApiUrl = API_URL || 'http://localhost:3001';

// ── Bundle Analyzer (opt-in via ANALYZE=true) ─────────────────────────────────
// Use a sync wrapper — top-level await is unreliable in next.config.js
import bundleAnalyzerPkg from '@next/bundle-analyzer';
const withBundleAnalyzer =
  process.env.ANALYZE === 'true'
    ? bundleAnalyzerPkg({ enabled: true })
    : (config) => config;

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Output ──────────────────────────────────────────────────────────────────
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,

  // ── Image Optimization ──────────────────────────────────────────────────────
  images: {
    remotePatterns: [],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
  },

  // ── Compression ─────────────────────────────────────────────────────────────
  compress: true,

  // ── Strict Mode ─────────────────────────────────────────────────────────────
  reactStrictMode: true,

  // ── Remove X-Powered-By header ──────────────────────────────────────────────
  poweredByHeader: false,

  // ── Experimental performance features ───────────────────────────────────────
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      '@stellar/stellar-sdk',
      '@stellar/freighter-api',
      '@sumsub/websdk-react',
      'swr',
    ],
  },

  // ── Proxy API calls to backend ──────────────────────────────────────────────
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${resolvedApiUrl}/api/:path*` }];
  },

  // ── HTTP Caching & Security Headers ─────────────────────────────────────────
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/_next/image/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },

  // ── Webpack Customisation ───────────────────────────────────────────────────
  webpack(config, { isServer }) {
    if (!isServer) {
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [new URL(import.meta.url).pathname],
        },
      };

      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          charts: {
            test: /[\\/]node_modules[\\/](recharts|d3-.*)[\\/]/,
            name: 'chunks/charts',
            chunks: 'all',
            priority: 30,
          },
          stellar: {
            test: /[\\/]node_modules[\\/](@stellar)[\\/]/,
            name: 'chunks/stellar',
            chunks: 'all',
            priority: 30,
          },
          sentry: {
            test: /[\\/]node_modules[\\/](@sentry)[\\/]/,
            name: 'chunks/sentry',
            chunks: 'all',
            priority: 20,
          },
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'chunks/vendor',
            chunks: 'all',
            priority: 10,
            reuseExistingChunk: true,
          },
        },
      };
    }

    return config;
  },
};

// ── Export with Sentry + optional Bundle Analyzer ─────────────────────────────
export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  silent: true,
  hideSourceMaps: true,
  disableLogger: true,
  tunnelRoute: '/monitoring',

  autoInstrumentServerFunctions: true,
  autoInstrumentMiddleware: true,
  autoInstrumentAppDirectory: true,

  release: {
    name: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
    deploy: {
      env: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    },
  },
});
