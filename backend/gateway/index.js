/**
 * API Gateway middleware layer.
 *
 * Provides a single entry point for all /api/* traffic with:
 *  - Centralized JWT authentication (opt-out via PUBLIC_ROUTES)
 *  - Tier-aware per-user rate limiting (sliding window + burst)
 *  - Structured request/response logging
 *  - Prometheus metrics per route
 *  - Request ID propagation
 */

import crypto from 'crypto';
import authMiddleware from '../api/middleware/auth.js';
import { createPerUserRateLimiter } from '../api/middleware/rateLimiter.js';
import { httpRequestDuration, httpRequestTotal, httpRequestsInFlight } from '../lib/metrics.js';

// ── Routes that skip JWT auth ─────────────────────────────────────────────────

const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/refresh' },
  { method: 'GET',  path: '/api/health' },
  { method: 'GET',  path: '/health' },
  { method: 'GET',  path: '/api/metrics' },
  { method: 'GET',  path: '/api/csrf-token' },
];

function isPublicRoute(req) {
  return PUBLIC_ROUTES.some(
    (r) =>
      r.method === req.method &&
      (req.path === r.path || req.path.startsWith(r.path + '/')),
  );
}

// ── Shared per-user rate limiter (tier-aware) ─────────────────────────────────

const perUserLimiter = createPerUserRateLimiter({ prefix: 'gw', adaptive: true });

// ── Request ID ────────────────────────────────────────────────────────────────

function requestId(req, res, next) {
  const id = req.headers['x-request-id'] || crypto.randomUUID();
  req.requestId = id;
  res.set('X-Request-Id', id);
  next();
}

// ── Structured logger ─────────────────────────────────────────────────────────

function gatewayLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO';
    console.log(
      JSON.stringify({
        level,
        ts: new Date().toISOString(),
        reqId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms,
        user: req.user?.userId ?? null,
        ip: req.ip,
      }),
    );
  });
  next();
}

// ── Prometheus instrumentation ────────────────────────────────────────────────

function gatewayMetrics(req, res, next) {
  httpRequestsInFlight.inc();
  const end = httpRequestDuration.startTimer();
  const start = Date.now();

  res.on('finish', () => {
    const route = req.route?.path ?? req.path ?? 'unknown';
    const labels = { method: req.method, route, status_code: res.statusCode };
    end(labels);
    httpRequestTotal.inc(labels);
    httpRequestsInFlight.dec();
  });

  next();
}

// ── Gateway factory ───────────────────────────────────────────────────────────

/**
 * Returns an array of Express middleware that forms the API gateway.
 * Mount with:  app.use('/api', ...createGateway())
 */
export function createGateway() {
  return [
    requestId,
    gatewayLogger,
    gatewayMetrics,

    // Auth: skip public routes, otherwise require valid JWT
    (req, res, next) => {
      if (isPublicRoute(req)) return next();
      return authMiddleware(req, res, next);
    },

    // Rate limiting: applied after auth so tier is available on req.user
    perUserLimiter,
  ];
}
