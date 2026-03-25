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

  // ── Strict Mode for better dev experience ───────────────────────────────────
  reactStrictMode: true,

  // ── Power optimisations ─────────────────────────────────────────────────────
  poweredByHeader: false, // Remove X-Powered-By header

  // ── Experimental performance features ───────────────────────────────────────
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', '@stellar/stellar-sdk', 'swr'],
  },

  // ── Proxy API calls to backend in development ──────────────────────────────
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },

  // ── Security & Caching Headers ──────────────────────────────────────────────
  async headers() {
    return [
      {
        // Cache static assets aggressively
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Cache optimized images
        source: '/_next/image/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=2592000, stale-while-revalidate=86400',
          },
        ],
      },
      {
        // Security headers for all routes
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },

  // ── Webpack Customisation ───────────────────────────────────────────────────
  webpack(config, { isServer }) {
    // Code splitting: create separate chunks for large vendor libs
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          ...config.optimization.splitChunks,
          cacheGroups: {
            ...config.optimization.splitChunks?.cacheGroups,
            // Separate chunk for charting library (recharts is large)
            charts: {
              test: /[\\/]node_modules[\\/](recharts|d3-.*)[\\/]/,
              name: 'charts',
              chunks: 'all',
              priority: 30,
            },
            // Separate chunk for Stellar SDK (crypto-heavy)
            stellar: {
              test: /[\\/]node_modules[\\/](@stellar)[\\/]/,
              name: 'stellar',
              chunks: 'all',
              priority: 30,
            },
            // Separate chunk for Sentry (observability)
            sentry: {
              test: /[\\/]node_modules[\\/](@sentry)[\\/]/,
              name: 'sentry',
              chunks: 'all',
              priority: 20,
            },
            // Common vendor chunk
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendor',
              chunks: 'all',
              priority: 10,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }

    return config;
  },
};

// ── Export with Sentry + optional Bundle Analyzer ─────────────────────────────
export default withSentryConfig(withBundleAnalyzer(nextConfig), {
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
