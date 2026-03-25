/**
 * Sentry — Backend Initialisation
 *
 * Import this module at the very top of server.js (before any other imports)
 * so Sentry can instrument all subsequent requires.
 *
 * Environment variables:
 *   SENTRY_DSN          — Sentry project DSN (required to enable)
 *   SENTRY_ENVIRONMENT  — e.g. "production" | "staging" | "development"
 *   SENTRY_RELEASE      — release identifier, e.g. git SHA or semver tag
 *   SENTRY_TRACES_SAMPLE_RATE — 0.0–1.0, default 0.1 in prod, 1.0 in dev
 *
 * @module sentry
 */

import * as Sentry from '@sentry/node';

const DSN = process.env.SENTRY_DSN;
const ENV = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
const RELEASE = process.env.SENTRY_RELEASE;
const IS_PROD = ENV === 'production';

// Default sample rate: full in dev/staging, 10 % in production
const DEFAULT_TRACES_RATE = IS_PROD ? 0.1 : 1.0;
const traceSampleRate = parseFloat(
  process.env.SENTRY_TRACES_SAMPLE_RATE ?? String(DEFAULT_TRACES_RATE),
);

if (DSN) {
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    release: RELEASE,
    tracesSampleRate: traceSampleRate,

    // Attach request data (URL, method, headers) to every event
    integrations: [Sentry.httpIntegration({ tracing: true }), Sentry.expressIntegration()],

    // Strip sensitive headers before sending
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-admin-api-key'];
      }
      return event;
    },
  });

  console.log(`[Sentry] Initialised — env=${ENV} traces=${traceSampleRate}`);
} else {
  console.warn('[Sentry] SENTRY_DSN not set — error tracking disabled');
}

export default Sentry;
