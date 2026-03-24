/**
 * Sentry — Server (Node.js) Initialisation
 *
 * Loaded automatically by `withSentryConfig` for Next.js server-side code.
 */

import * as Sentry from '@sentry/nextjs';
import {
  SENTRY_DSN,
  SENTRY_ENV,
  SENTRY_RELEASE,
  TRACES_SAMPLE_RATE,
} from './lib/sentry.js';

Sentry.init({
  dsn: SENTRY_DSN,
  environment: SENTRY_ENV,
  release: SENTRY_RELEASE,
  tracesSampleRate: TRACES_SAMPLE_RATE,
  enabled: !!SENTRY_DSN,
});
