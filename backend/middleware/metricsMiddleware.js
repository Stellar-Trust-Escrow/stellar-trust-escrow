/**
 * HTTP Metrics Middleware
 *
 * Records per-request Prometheus metrics:
 *  - Duration histogram (method, normalized route, status code)
 *  - Request counter
 *  - In-flight gauge
 *
 * Route normalization replaces dynamic segments so cardinality stays low:
 *   /api/escrows/12345  →  /api/escrows/:id
 */

import { httpRequestDuration, httpRequestTotal, httpRequestsInFlight } from '../lib/metrics.js';

/**
 * Normalize Express route path from req.route or fall back to the raw URL
 * with common ID patterns replaced.
 */
function normalizeRoute(req) {
  // Use Express matched route if available (most accurate)
  if (req.route?.path) {
    const base = req.baseUrl || '';
    return base + req.route.path;
  }

  // Fallback: strip numeric IDs and Stellar addresses from the URL
  return req.path
    .replace(/\/[0-9]+/g, '/:id')
    .replace(/\/G[A-Z2-7]{55}/g, '/:address')
    .replace(/\/[0-9a-f]{64}/gi, '/:hash');
}

export default function metricsMiddleware(req, res, next) {
  // Skip the /metrics endpoint itself to avoid self-referential noise
  if (req.path === '/metrics') return next();

  const start = process.hrtime.bigint();
  httpRequestsInFlight.inc();

  res.on('finish', () => {
    httpRequestsInFlight.dec();

    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const route = normalizeRoute(req);
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };

    httpRequestDuration.observe(labels, durationMs);
    httpRequestTotal.inc(labels);
  });

  next();
}
