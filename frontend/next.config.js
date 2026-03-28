/** @type {import('next').NextConfig} */

import { withSentryConfig } from '@sentry/nextjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ── Bundle Analyzer (opt-in via ANALYZE=true) ─────────────────────────────────
let withBundleAnalyzer = (config) => config;
if (process.env.ANALYZE === 'true') {
  const analyzer = await import('@next/bundle-analyzer');
  withBundleAnalyzer = analyzer.default({ enabled: true });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ── Output ──────────────────────────────────────────────────────────────────
  // 'standalone' bundles only the files needed to run the server — smaller
  // Docker images and faster cold starts in serverless environments.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,

  // ── Image Optimization ──────────────────────────────────────────────────────
  images: {
    domains: [],
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
    // Tree-shake named imports from large packages at compile time.
    // Prevents the entire library being bundled when only a few exports are used.
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      '@stellar/stellar-sdk',
      '@stellar/freighter-api',
      '@sumsub/websdk-react',
      'swr',
    ],
  },

  // ── Proxy API calls to backend in development ──────────────────────────────
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/api/:path*` }];
  },

  // ── HTTP Caching & Security Headers ─────────────────────────────────────────
  // NOTE: only one `headers()` export is allowed — all rules must live here.
  async headers() {
    return [
      {
        // Service worker must never be cached so updates are picked up immediately.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript' },
        ],
      },
      {
        // Static assets are content-addressed (hash in filename) — cache forever.
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        // Optimized images are not content-addressed — use a shorter TTL with SWR.
        source: '/_next/image/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' },
        ],
      },
      {
        // Security headers for every route.
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
  webpack(config, { isServer, dev }) {
    if (!isServer) {
      // Persistent filesystem cache — dramatically speeds up incremental builds
      // by reusing compiled modules across restarts.
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          // Invalidate the cache when the config itself changes.
          config: [new URL(import.meta.url).pathname],
        },
      };

      // Code splitting: dedicated chunks for large, infrequently-changing libs.
      // Each group is loaded lazily and cached independently by the browser.
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          // Charting library — large, rarely changes
          charts: {
            test: /[\\/]node_modules[\\/](recharts|d3-.*)[\\/]/,
            name: 'chunks/charts',
            chunks: 'all',
            priority: 30,
          },
          // Stellar SDK — crypto-heavy, rarely changes
          stellar: {
            test: /[\\/]node_modules[\\/](@stellar)[\\/]/,
            name: 'chunks/stellar',
            chunks: 'all',
            priority: 30,
          },
          // Sentry — observability, rarely changes
          sentry: {
            test: /[\\/]node_modules[\\/](@sentry)[\\/]/,
            name: 'chunks/sentry',
            chunks: 'all',
            priority: 20,
          },
          // Everything else from node_modules
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

  // Tree-shake Sentry logger statements in production builds.
  disableLogger: true,

  // Tunnel Sentry requests through Next.js to avoid ad-blockers.
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
