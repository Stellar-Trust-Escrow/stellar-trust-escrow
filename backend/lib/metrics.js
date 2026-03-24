/**
 * Prometheus Metrics Registry
 *
 * Exposes application metrics via prom-client.
 * Scraped by Prometheus at GET /metrics.
 *
 * Metrics collected:
 *  - HTTP request duration & counts (by method, route, status)
 *  - Database query duration (by model, operation)
 *  - Cache hits / misses
 *  - Business metrics: escrows created, disputes raised, milestones completed
 *  - Node.js default metrics (event loop lag, heap, GC, etc.)
 */

/* eslint-disable no-undef */
import client from 'prom-client';

// ── Registry ──────────────────────────────────────────────────────────────────

const register = new client.Registry();
register.setDefaultLabels({
  app: 'stellar-trust-escrow',
  env: process.env.NODE_ENV || 'development',
});

// Collect default Node.js metrics (heap, event loop, GC, etc.)
client.collectDefaultMetrics({ register });

// ── HTTP Metrics ──────────────────────────────────────────────────────────────

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [register],
});

export const httpRequestTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestsInFlight = new client.Gauge({
  name: 'http_requests_in_flight',
  help: 'Number of HTTP requests currently being processed',
  registers: [register],
});

// ── Database Metrics ──────────────────────────────────────────────────────────

export const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_ms',
  help: 'Duration of Prisma database queries in milliseconds',
  labelNames: ['model', 'operation'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500],
  registers: [register],
});

export const dbQueryTotal = new client.Counter({
  name: 'db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['model', 'operation'],
  registers: [register],
});

export const dbSlowQueryTotal = new client.Counter({
  name: 'db_slow_queries_total',
  help: 'Total number of slow database queries (above threshold)',
  labelNames: ['model', 'operation'],
  registers: [register],
});

// ── Cache Metrics ─────────────────────────────────────────────────────────────

export const cacheHitsTotal = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['key_prefix'],
  registers: [register],
});

export const cacheMissesTotal = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['key_prefix'],
  registers: [register],
});

export const cacheSize = new client.Gauge({
  name: 'cache_size',
  help: 'Current number of entries in the in-memory cache',
  registers: [register],
});

// ── Business Metrics ──────────────────────────────────────────────────────────

export const escrowsCreatedTotal = new client.Counter({
  name: 'escrows_created_total',
  help: 'Total number of escrows created',
  registers: [register],
});

export const disputesRaisedTotal = new client.Counter({
  name: 'disputes_raised_total',
  help: 'Total number of disputes raised',
  registers: [register],
});

export const milestonesCompletedTotal = new client.Counter({
  name: 'milestones_completed_total',
  help: 'Total number of milestones completed',
  registers: [register],
});

export const activeEscrowsGauge = new client.Gauge({
  name: 'active_escrows',
  help: 'Current number of active escrows',
  registers: [register],
});

// ── Error Metrics ─────────────────────────────────────────────────────────────

export const errorsTotal = new client.Counter({
  name: 'errors_total',
  help: 'Total number of application errors',
  labelNames: ['type', 'route'],
  registers: [register],
});

// ── Compression Metrics ───────────────────────────────────────────────────────

export const compressedResponsesTotal = new client.Counter({
  name: 'http_compressed_responses_total',
  help: 'Total number of compressed HTTP responses',
  labelNames: ['algorithm', 'route'],
  registers: [register],
});

export const compressionBytesTotal = new client.Counter({
  name: 'http_compression_bytes_total',
  help: 'Total bytes before and after compression',
  labelNames: ['direction', 'algorithm'], // direction: original | compressed
  registers: [register],
});

export const compressionRatio = new client.Histogram({
  name: 'http_compression_ratio',
  help: 'Ratio of compressed size to original size (lower is better)',
  labelNames: ['algorithm', 'route'],
  buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  registers: [register],
});

export { register };
