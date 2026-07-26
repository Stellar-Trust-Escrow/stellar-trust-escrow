/**
 * Advanced Real-time API Analytics and Usage Tracking Pipeline
 *
 * Intercepts every REST request to measure latency, track HTTP status
 * distributions, and record per-route usage metrics. Metrics are flushed
 * asynchronously to avoid blocking the response path.
 *
 * ## Exported aggregates (for admin dashboards)
 *   analytics.getSnapshot()  – current in-memory metrics
 *   analytics.reset()        – clear counters (e.g. after a flush)
 *
 * ## Configuration (environment variables)
 *   ANALYTICS_FLUSH_INTERVAL_MS  – how often to flush to DB (default 10_000)
 *   ANALYTICS_DB_URL             – InfluxDB / TimescaleDB connection string
 *
 * @module middleware/analytics
 */

import { performance } from 'node:perf_hooks';
import { getLogger } from '../../config/logger.js';

// ── In-memory metric store ────────────────────────────────────────────────────

/**
 * @typedef {Object} RouteMetrics
 * @property {number} requests   – total request count
 * @property {number} totalMs    – cumulative latency in ms
 * @property {number} minMs      – minimum observed latency
 * @property {number} maxMs      – maximum observed latency
 * @property {Record<string,number>} statusCodes – count per HTTP status code
 * @property {Record<string,number>} methods     – count per HTTP method
 */

/** @type {Map<string, RouteMetrics>} */
const routeMetrics = new Map();

/** Global counters */
const globalCounters = {
  totalRequests: 0,
  totalErrors: 0, // 4xx + 5xx
  totalLatencyMs: 0,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a URL path by replacing numeric/UUID segments with placeholders
 * so that `/escrows/123` and `/escrows/456` map to the same route key.
 *
 * @param {string} path
 * @returns {string}
 */
function normalisePath(path) {
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
    .replace(/\/\d+/g, '/:id');
}

/**
 * Return or create a RouteMetrics entry for the given key.
 *
 * @param {string} key
 * @returns {RouteMetrics}
 */
function getOrCreate(key) {
  if (!routeMetrics.has(key)) {
    routeMetrics.set(key, {
      requests: 0,
      totalMs: 0,
      minMs: Infinity,
      maxMs: 0,
      statusCodes: {},
      methods: {},
    });
  }
  return routeMetrics.get(key);
}

/**
 * Record a completed request into the in-memory store.
 * Called asynchronously via setImmediate so it never blocks the response.
 *
 * @param {string} method
 * @param {string} rawPath
 * @param {number} statusCode
 * @param {number} durationMs
 */
function record(method, rawPath, statusCode, durationMs) {
  const route = normalisePath(rawPath);
  const key = `${method} ${route}`;
  const m = getOrCreate(key);

  m.requests += 1;
  m.totalMs += durationMs;
  if (durationMs < m.minMs) m.minMs = durationMs;
  if (durationMs > m.maxMs) m.maxMs = durationMs;

  const sc = String(statusCode);
  m.statusCodes[sc] = (m.statusCodes[sc] ?? 0) + 1;
  m.methods[method] = (m.methods[method] ?? 0) + 1;

  globalCounters.totalRequests += 1;
  globalCounters.totalLatencyMs += durationMs;
  if (statusCode >= 400) globalCounters.totalErrors += 1;
}

// ── Async DB flush ────────────────────────────────────────────────────────────

const FLUSH_INTERVAL_MS = Number(process.env.ANALYTICS_FLUSH_INTERVAL_MS ?? 10_000);

/**
 * Flush current metrics snapshot to the configured time-series database.
 * Runs in the background; errors are logged but never propagate to requests.
 */
async function flushToDatabase() {
  const snapshot = getSnapshot();
  if (snapshot.totalRequests === 0) return;

  const logger = getLogger();

  try {
    const dbUrl = process.env.ANALYTICS_DB_URL;
    if (dbUrl) {
      // Write to InfluxDB line protocol or TimescaleDB via HTTP.
      // The actual HTTP call is intentionally kept dependency-free here;
      // operators can swap in their preferred client.
      const lines = snapshot.routes.map(({ route, metrics }) => {
        const avg = metrics.requests > 0 ? metrics.totalMs / metrics.requests : 0;
        return (
          `api_route,route=${encodeURIComponent(route)} ` +
          `requests=${metrics.requests}i,` +
          `avg_latency_ms=${avg.toFixed(3)},` +
          `min_latency_ms=${metrics.minMs === Infinity ? 0 : metrics.minMs.toFixed(3)},` +
          `max_latency_ms=${metrics.maxMs.toFixed(3)} ` +
          `${Date.now()}000000`
        );
      });

      await fetch(dbUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: lines.join('\n'),
      });
    }

    logger.info({
      message: 'analytics_flush',
      type: 'analytics',
      totalRequests: snapshot.totalRequests,
      totalErrors: snapshot.totalErrors,
      avgLatencyMs: snapshot.avgLatencyMs,
      routeCount: snapshot.routes.length,
    });
  } catch (err) {
    logger.warn({ message: 'analytics_flush_error', error: err?.message });
  }
}

// Start background flush loop (no-op if interval is 0)
if (FLUSH_INTERVAL_MS > 0) {
  setInterval(flushToDatabase, FLUSH_INTERVAL_MS).unref();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a point-in-time snapshot of all collected metrics.
 *
 * @returns {{
 *   totalRequests: number,
 *   totalErrors: number,
 *   avgLatencyMs: number,
 *   routes: Array<{route: string, metrics: RouteMetrics}>
 * }}
 */
export function getSnapshot() {
  const avg =
    globalCounters.totalRequests > 0
      ? globalCounters.totalLatencyMs / globalCounters.totalRequests
      : 0;

  return {
    totalRequests: globalCounters.totalRequests,
    totalErrors: globalCounters.totalErrors,
    avgLatencyMs: Math.round(avg * 1000) / 1000,
    routes: Array.from(routeMetrics.entries()).map(([route, metrics]) => ({
      route,
      metrics: { ...metrics, statusCodes: { ...metrics.statusCodes } },
    })),
  };
}

/**
 * Reset all in-memory counters (e.g. after a successful DB flush).
 */
export function reset() {
  routeMetrics.clear();
  globalCounters.totalRequests = 0;
  globalCounters.totalErrors = 0;
  globalCounters.totalLatencyMs = 0;
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Express middleware that measures request latency and records analytics.
 * Recording is deferred via setImmediate so it never adds latency to responses.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const analyticsMiddleware = (req, res, next) => {
  const startMs = performance.now();

  res.on('finish', () => {
    const durationMs = performance.now() - startMs;
    const rawPath = req.originalUrl?.split('?')[0] ?? req.path;

    // Prefix the metric key with the tenant slug so per-tenant dashboards can
    // filter without post-processing, and aggregate keys remain unambiguous
    // across tenants that share the same route patterns.
    const tenantPrefix = req.tenant?.slug ? `[${req.tenant.slug}] ` : '';
    const path = `${tenantPrefix}${rawPath}`;

    // Defer recording to avoid blocking the response
    setImmediate(() => record(req.method, path, res.statusCode, durationMs));
  });

  next();
};

export default analyticsMiddleware;
