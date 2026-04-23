/**
 * Comprehensive health check routes.
 *
 * GET /health        — all components; 200 ok | 200 degraded | 503 error
 * GET /health/live   — liveness probe; always 200 while the process responds
 * GET /health/ready  — readiness probe; 200 when critical deps are up, 503 otherwise
 *
 * Components checked:
 *   db        — PostgreSQL via Prisma (critical)
 *   cache     — Redis / in-memory fallback
 *   stellar   — Soroban RPC reachability
 *   email     — queue processor state
 *   websocket — active connection pool metrics
 */
import { Router } from 'express';
import { SorobanRpc } from '@stellar/stellar-sdk';

import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import { pool } from '../websocket/handlers.js';
import { getQueueSnapshot } from '../../services/emailService.js';

const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const STELLAR_TIMEOUT_MS = parseInt(process.env.HEALTH_STELLAR_TIMEOUT_MS || '5000', 10);

const router = Router();

// ── Component checks ──────────────────────────────────────────────────────────

async function checkDatabase() {
  const t0 = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - t0;

    let poolInfo = null;
    try {
      const rows = await prisma.$queryRaw`
        SELECT count(*) AS connection_count, now() AS current_time
        FROM pg_stat_activity
        WHERE datname = current_database()
      `;
      poolInfo = {
        activeConnections: parseInt(rows[0].connection_count),
        timestamp: rows[0].current_time,
      };
    } catch {
      // Pool info is non-critical; omit on error
    }

    return { status: 'ok', latencyMs, pool: poolInfo };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - t0, error: err.message };
  }
}

async function checkCache() {
  const analytics = cache.analytics();
  const redisConfigured = Boolean(process.env.REDIS_URL);

  // Redis was configured but is unreachable → degraded (not error; memory fallback is active)
  const status = redisConfigured && analytics.backend === 'memory' ? 'degraded' : 'ok';

  return { status, ...analytics };
}

async function checkStellar() {
  const t0 = Date.now();
  try {
    const server = new SorobanRpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith('http://') });
    const ledger = await Promise.race([
      server.getLatestLedger(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), STELLAR_TIMEOUT_MS),
      ),
    ]);
    return { status: 'ok', latencyMs: Date.now() - t0, ledger: ledger.sequence, rpcUrl: RPC_URL };
  } catch (err) {
    return { status: 'error', latencyMs: Date.now() - t0, error: err.message, rpcUrl: RPC_URL };
  }
}

async function checkEmail() {
  try {
    const snapshot = await getQueueSnapshot();
    const pending = snapshot.queue.filter((j) => j.status === 'queued').length;
    const failed = snapshot.queue.filter((j) => j.status === 'failed').length;

    // Flag as degraded if there's a backlog of failures
    const status = failed > 10 ? 'degraded' : 'ok';
    return { status, queueLength: snapshot.queue.length, pending, failed };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

function checkWebSocket() {
  try {
    return { status: 'ok', ...pool.getMetrics() };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

// ── Aggregation ───────────────────────────────────────────────────────────────

/**
 * Derives overall status from a map of component results.
 * Any 'error' → 'error', any 'degraded' → 'degraded', otherwise 'ok'.
 *
 * @param {Record<string, { status: string }>} components
 * @returns {'ok'|'degraded'|'error'}
 */
function aggregateStatus(components) {
  const statuses = Object.values(components).map((c) => c.status);
  if (statuses.includes('error')) return 'error';
  if (statuses.includes('degraded')) return 'degraded';
  return 'ok';
}

function basePayload() {
  return {
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: process.env.npm_package_version || '0.1.0',
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Comprehensive health check
 *     description: >
 *       Returns the health status of every application component.
 *       HTTP 200 for ok/degraded, HTTP 503 when a critical component (db) is down.
 *     responses:
 *       200:
 *         description: Service is healthy or degraded but operational
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       503:
 *         description: Service is unhealthy — critical dependency down
 */
router.get('/', async (_req, res) => {
  const [db, cacheResult, stellar, email] = await Promise.all([
    checkDatabase(),
    checkCache(),
    checkStellar(),
    checkEmail(),
  ]);
  const websocket = checkWebSocket();

  const components = { db, cache: cacheResult, stellar, email, websocket };
  const status = aggregateStatus(components);

  res.status(status === 'error' ? 503 : 200).json({
    status,
    ...basePayload(),
    components,
  });
});

/**
 * @openapi
 * /health/live:
 *   get:
 *     tags: [Health]
 *     summary: Liveness probe
 *     description: >
 *       Lightweight check that confirms the process is alive and the event loop
 *       is responsive. Suitable for Kubernetes liveness probes. Always 200.
 *     responses:
 *       200:
 *         description: Process is alive
 */
router.get('/live', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

/**
 * @openapi
 * /health/ready:
 *   get:
 *     tags: [Health]
 *     summary: Readiness probe
 *     description: >
 *       Checks critical dependencies (database, cache) to determine whether
 *       the service can handle traffic. Returns 503 when the database is down.
 *       Suitable for Kubernetes readiness probes and load-balancer health checks.
 *     responses:
 *       200:
 *         description: Service is ready to serve traffic
 *       503:
 *         description: Service is not ready — critical dependency unavailable
 */
router.get('/ready', async (_req, res) => {
  const [db, cacheResult] = await Promise.all([checkDatabase(), checkCache()]);
  const components = { db, cache: cacheResult };
  const status = aggregateStatus(components);

  res.status(status === 'error' ? 503 : 200).json({
    status,
    timestamp: new Date().toISOString(),
    components,
  });
});

export default router;
