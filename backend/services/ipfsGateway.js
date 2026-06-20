/**
 * IPFS Gateway Service — Resilient Proxy with Redis Caching and Failover
 *
 * Maintains a pool of public IPFS gateways. For each asset request:
 *  1. Returns immediately from Redis cache if available.
 *  2. Races all healthy gateways in parallel; uses the first successful response.
 *  3. Caches the result in Redis with a configurable TTL.
 *  4. Tracks per-gateway latency and failure counts.
 *  5. Removes unresponsive gateways from the active pool; re-admits them after
 *     a recovery window.
 *  6. Runs periodic health checks to keep the pool fresh.
 *
 * Environment variables:
 *  IPFS_GATEWAYS          Comma-separated gateway base URLs (optional, has defaults)
 *  IPFS_CACHE_TTL_SEC     Redis TTL for cached assets in seconds (default: 3600)
 *  IPFS_REQUEST_TIMEOUT   Per-gateway fetch timeout in ms (default: 8000)
 *  IPFS_RECOVERY_WINDOW   Quarantine duration for failed gateways in ms (default: 120000)
 *  IPFS_HEALTH_INTERVAL   Health-check interval in ms (default: 60000)
 *  REDIS_URL              Redis connection string (optional; skips caching if absent)
 *
 * @module services/ipfsGateway
 */

import { createClient } from 'redis';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('service.ipfsGateway');

// ── Configuration ─────────────────────────────────────────────────────────────

const DEFAULT_GATEWAYS = [
  'https://ipfs.io',
  'https://cloudflare-ipfs.com',
  'https://gateway.pinata.cloud',
  'https://dweb.link',
  'https://w3s.link',
];

const GATEWAYS = (process.env.IPFS_GATEWAYS || '')
  .split(',')
  .map((g) => g.trim())
  .filter(Boolean);

const GATEWAY_POOL = GATEWAYS.length ? GATEWAYS : DEFAULT_GATEWAYS;
const CACHE_TTL = parseInt(process.env.IPFS_CACHE_TTL_SEC || '3600', 10);
const REQUEST_TIMEOUT = parseInt(process.env.IPFS_REQUEST_TIMEOUT || '8000', 10);
const RECOVERY_WINDOW = parseInt(process.env.IPFS_RECOVERY_WINDOW || '120000', 10);
const HEALTH_INTERVAL = parseInt(process.env.IPFS_HEALTH_INTERVAL || '60000', 10);
const CACHE_PREFIX = 'ipfs:asset:';

// ── Gateway state ─────────────────────────────────────────────────────────────

/**
 * @typedef {object} GatewayState
 * @property {string}  url           - Base URL of the gateway.
 * @property {boolean} healthy       - Whether the gateway is currently active.
 * @property {number}  failCount     - Consecutive failure count.
 * @property {number}  avgLatency    - Exponential moving average latency (ms).
 * @property {number|null} quarantineUntil - Timestamp when quarantine expires.
 */

/** @type {Map<string, GatewayState>} */
const gatewayStates = new Map(
  GATEWAY_POOL.map((url) => [
    url,
    { url, healthy: true, failCount: 0, avgLatency: 0, quarantineUntil: null },
  ]),
);

function getHealthyGateways() {
  const now = Date.now();
  const healthy = [];
  for (const state of gatewayStates.values()) {
    if (!state.healthy && state.quarantineUntil && now >= state.quarantineUntil) {
      // Re-admit after recovery window
      state.healthy = true;
      state.failCount = 0;
      state.quarantineUntil = null;
      logger.info({ gateway: state.url }, 'Gateway re-admitted after recovery');
    }
    if (state.healthy) healthy.push(state);
  }
  // Sort by ascending average latency so fastest gateway wins ties
  return healthy.sort((a, b) => a.avgLatency - b.avgLatency);
}

function recordSuccess(url, latencyMs) {
  const state = gatewayStates.get(url);
  if (!state) return;
  state.failCount = 0;
  // Exponential moving average (α = 0.3)
  state.avgLatency = state.avgLatency === 0 ? latencyMs : 0.7 * state.avgLatency + 0.3 * latencyMs;
}

function recordFailure(url) {
  const state = gatewayStates.get(url);
  if (!state) return;
  state.failCount += 1;
  if (state.failCount >= 3) {
    state.healthy = false;
    state.quarantineUntil = Date.now() + RECOVERY_WINDOW;
    logger.warn({ gateway: url, failCount: state.failCount }, 'Gateway quarantined');
  }
}

// ── Redis client ──────────────────────────────────────────────────────────────

let redis = null;

if (process.env.REDIS_URL) {
  redis = createClient({ url: process.env.REDIS_URL });
  redis.on('error', (err) => logger.error({ err }, 'Redis error in ipfsGateway'));
  redis.connect().catch((err) => {
    logger.warn({ err }, 'Redis unavailable; IPFS caching disabled');
    redis = null;
  });
}

async function cacheGet(key) {
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key, value, ttl) {
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), { EX: ttl });
  } catch {
    /* non-fatal */
  }
}

// ── Core fetch logic ──────────────────────────────────────────────────────────

/**
 * Fetch an IPFS asset by CID, racing all healthy gateways in parallel.
 *
 * @param {string} cid - IPFS content identifier.
 * @returns {Promise<{ data: Buffer, contentType: string, gateway: string, cached: boolean }>}
 */
async function fetchAsset(cid) {
  const cacheKey = `${CACHE_PREFIX}${cid}`;

  // 1. Cache hit
  const cached = await cacheGet(cacheKey);
  if (cached) {
    logger.debug({ cid }, 'IPFS cache hit');
    return {
      data: Buffer.from(cached.data, 'base64'),
      contentType: cached.contentType,
      gateway: cached.gateway,
      cached: true,
    };
  }

  // 2. Race healthy gateways
  const healthy = getHealthyGateways();
  if (healthy.length === 0) {
    throw new Error('No healthy IPFS gateways available');
  }

  const result = await Promise.any(
    healthy.map(async (state) => {
      const url = `${state.url}/ipfs/${cid}`;
      const start = Date.now();
      const res = await fetch(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      });
      if (!res.ok) {
        recordFailure(state.url);
        throw new Error(`Gateway ${state.url} returned ${res.status}`);
      }
      const latency = Date.now() - start;
      recordSuccess(state.url, latency);
      const data = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get('content-type') || 'application/octet-stream';
      logger.debug({ cid, gateway: state.url, latencyMs: latency }, 'IPFS fetch success');
      return { data, contentType, gateway: state.url, cached: false };
    }),
  );

  // 3. Cache the result
  await cacheSet(
    cacheKey,
    {
      data: result.data.toString('base64'),
      contentType: result.contentType,
      gateway: result.gateway,
    },
    CACHE_TTL,
  );

  return result;
}

// ── Health checks ─────────────────────────────────────────────────────────────

async function checkGatewayHealth(state) {
  // Use a known small CID as a probe (empty directory listing)
  const probe = 'QmUNLLsPACCz1vLxQVkXqqLX5R1X345qqfHbsf67hvA3Nn';
  const url = `${state.url}/ipfs/${probe}`;
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    recordSuccess(state.url, Date.now() - start);
  } catch {
    recordFailure(state.url);
  }
}

function startHealthChecks() {
  setInterval(async () => {
    for (const state of gatewayStates.values()) {
      await checkGatewayHealth(state);
    }
    logger.debug(
      { healthy: getHealthyGateways().length, total: gatewayStates.size },
      'IPFS gateway health check complete',
    );
  }, HEALTH_INTERVAL);
}

// Start health checks unless in test environment
if (process.env.NODE_ENV !== 'test') {
  startHealthChecks();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Retrieve an IPFS asset by CID with caching and failover.
 *
 * @param {string} cid
 * @returns {Promise<{ data: Buffer, contentType: string, gateway: string, cached: boolean }>}
 */
export async function getAsset(cid) {
  if (!cid || typeof cid !== 'string') throw new Error('Invalid CID');
  return fetchAsset(cid.trim());
}

/**
 * Return a snapshot of current gateway health metrics.
 *
 * @returns {Array<{ url: string, healthy: boolean, avgLatency: number, failCount: number }>}
 */
export function getGatewayStatus() {
  return Array.from(gatewayStates.values()).map(({ url, healthy, avgLatency, failCount }) => ({
    url,
    healthy,
    avgLatency: Math.round(avgLatency),
    failCount,
  }));
}

/**
 * Invalidate the Redis cache entry for a specific CID.
 *
 * @param {string} cid
 */
export async function invalidateCache(cid) {
  if (!redis) return;
  await redis.del(`${CACHE_PREFIX}${cid}`);
}

export default { getAsset, getGatewayStatus, invalidateCache };
