/**
 * Sentry — Edge Runtime Initialisation
 *
 * Loaded automatically by `withSentryConfig` for Next.js edge routes.
 */

import * as Sentry from '@sentry/nextjs';
import { SENTRY_DSN, SENTRY_ENV, SENTRY_RELEASE } from './lib/sentry.js';

Sentry.init({
  dsn: SENTRY_DSN,
  environment: SENTRY_ENV,
  release: SENTRY_RELEASE,
  // Edge runtime doesn't support tracing integrations
  tracesSampleRate: 0,
  enabled: !!SENTRY_DSN,
});
