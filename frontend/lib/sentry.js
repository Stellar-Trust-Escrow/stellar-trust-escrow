/**
 * Sentry — shared browser/server config helper
 *
 * Used by sentry.client.config.js, sentry.server.config.js, and
 * sentry.edge.config.js to avoid repeating options.
 *
 * Environment variables (all NEXT_PUBLIC_* are safe to expose):
 *   NEXT_PUBLIC_SENTRY_DSN       — Sentry project DSN
 *   NEXT_PUBLIC_SENTRY_ENV       — e.g. "production" | "staging"
 *   NEXT_PUBLIC_SENTRY_RELEASE   — release tag / git SHA
 *   SENTRY_AUTH_TOKEN            — upload token for source maps (server-only)
 */

export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
export const SENTRY_ENV =
  process.env.NEXT_PUBLIC_SENTRY_ENV || process.env.NODE_ENV || 'development';
export const SENTRY_RELEASE = process.env.NEXT_PUBLIC_SENTRY_RELEASE;
const IS_PROD = SENTRY_ENV === 'production';

export const TRACES_SAMPLE_RATE = IS_PROD ? 0.1 : 1.0;
export const REPLAYS_SESSION_RATE = IS_PROD ? 0.05 : 0.0;
export const REPLAYS_ERROR_RATE = IS_PROD ? 1.0 : 0.0;
