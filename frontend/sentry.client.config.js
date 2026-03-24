/**
 * Sentry — Browser (Client) Initialisation
 *
 * This file is loaded automatically by the Sentry Next.js SDK via
 * `withSentryConfig` in next.config.js. Do not import it manually.
 */

import * as Sentry from '@sentry/nextjs';
import {
  SENTRY_DSN,
  SENTRY_ENV,
  SENTRY_RELEASE,
  TRACES_SAMPLE_RATE,
  REPLAYS_SESSION_RATE,
  REPLAYS_ERROR_RATE,
} from './lib/sentry.js';

Sentry.init({
  dsn: SENTRY_DSN,
  environment: SENTRY_ENV,
  release: SENTRY_RELEASE,

  tracesSampleRate: TRACES_SAMPLE_RATE,

  // Session Replay — records user interactions for error reproduction
  replaysSessionSampleRate: REPLAYS_SESSION_RATE,
  replaysOnErrorSampleRate: REPLAYS_ERROR_RATE,

  integrations: [
    Sentry.replayIntegration({
      // Mask all text and block all media by default for privacy
      maskAllText: true,
      blockAllMedia: true,
    }),
    Sentry.browserTracingIntegration(),
  ],

  // Don't send events in development unless DSN is explicitly set
  enabled: !!SENTRY_DSN,

  beforeSend(event) {
    // Strip wallet addresses from breadcrumbs to avoid PII leakage
    if (event.breadcrumbs?.values) {
      event.breadcrumbs.values = event.breadcrumbs.values.map((b) => ({
        ...b,
        message: b.message?.replace(/G[A-Z2-7]{55}/g, '[STELLAR_ADDRESS]'),
      }));
    }
    return event;
  },
});
