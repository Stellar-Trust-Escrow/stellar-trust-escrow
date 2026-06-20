/**
 * AML / Compliance Middleware
 *
 * Intercepts escrow creation and funding requests to screen participating
 * wallet addresses against a third-party AML/sanctions API (TRM Labs by
 * default; swap `AML_PROVIDER` env var to switch).
 *
 * ## Behaviour
 * 1. Extracts `clientAddress` and `freelancerAddress` from the request body.
 * 2. Checks Redis for a cached scan result (TTL: AML_CACHE_TTL_SECONDS).
 * 3. On cache miss, calls the configured AML provider API.
 * 4. Rejects the request with 403 if any address is flagged or sanctioned.
 * 5. Logs every scan to the audit trail (address, risk score, outcome).
 *
 * ## Environment variables
 *   AML_PROVIDER          — "trm" | "elliptic" | "mock"  (default: "mock")
 *   AML_API_KEY           — API key for the chosen provider
 *   AML_API_URL           — Base URL override (optional)
 *   AML_RISK_THRESHOLD    — Max acceptable risk score 0–100 (default: 70)
 *   AML_CACHE_TTL_SECONDS — Redis TTL for scan results (default: 3600)
 *
 * ## Usage
 *   import { amlCheck } from '../middleware/compliance.js';
 *   router.post('/escrows', amlCheck, escrowController.create);
 *
 * @module middleware/compliance
 */

import Redis from 'ioredis';

// ── Configuration ─────────────────────────────────────────────────────────────

const PROVIDER = process.env.AML_PROVIDER || 'mock';
const API_KEY = process.env.AML_API_KEY || '';
const RISK_THRESHOLD = parseInt(process.env.AML_RISK_THRESHOLD || '70', 10);
const CACHE_TTL = parseInt(process.env.AML_CACHE_TTL_SECONDS || '3600', 10);

const PROVIDER_URLS = {
  trm: 'https://api.trmlabs.com/public/v2/screening/addresses',
  elliptic: 'https://aml.elliptic.co/v2/wallet',
};

// ── Redis client (lazy singleton) ─────────────────────────────────────────────

let _redis = null;

function getRedis() {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    _redis.on('error', (err) => {
      // Non-fatal: if Redis is down we fall through to live API calls
      console.warn('[compliance] Redis error (cache disabled):', err.message);
    });
  }
  return _redis;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

const cacheKey = (address) => `aml:scan:${address.toLowerCase()}`;

async function getCached(address) {
  try {
    const raw = await getRedis().get(cacheKey(address));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // Redis unavailable — proceed without cache
  }
}

async function setCached(address, result) {
  try {
    await getRedis().set(cacheKey(address), JSON.stringify(result), 'EX', CACHE_TTL);
  } catch {
    // Non-fatal
  }
}

// ── AML provider adapters ─────────────────────────────────────────────────────

/**
 * @typedef {Object} ScanResult
 * @property {string}  address
 * @property {number}  riskScore   — 0 (clean) to 100 (high risk)
 * @property {boolean} sanctioned  — true if on a sanctions list
 * @property {string}  riskLevel   — "low" | "medium" | "high" | "severe"
 * @property {string}  provider
 * @property {number}  scannedAt   — Unix timestamp (ms)
 */

async function scanViaTRM(address) {
  const res = await fetch(PROVIDER_URLS.trm, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${API_KEY}:`).toString('base64')}`,
    },
    body: JSON.stringify([{ address, chain: 'stellar' }]),
  });

  if (!res.ok) {
    throw new Error(`TRM API error: ${res.status} ${res.statusText}`);
  }

  const [data] = await res.json();
  const riskScore = Math.round((data?.riskScore ?? 0) * 100);
  const sanctioned = data?.entities?.some((e) => e.type === 'sanctions') ?? false;

  return {
    address,
    riskScore,
    sanctioned,
    riskLevel: riskLevel(riskScore),
    provider: 'trm',
    scannedAt: Date.now(),
  };
}

async function scanViaElliptic(address) {
  const url = `${process.env.AML_API_URL || PROVIDER_URLS.elliptic}?asset=stellar&wallet_identifier=${address}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  if (!res.ok) {
    throw new Error(`Elliptic API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const riskScore = Math.round((data?.risk_score ?? 0) * 100);
  const sanctioned = data?.is_sanctioned ?? false;

  return {
    address,
    riskScore,
    sanctioned,
    riskLevel: riskLevel(riskScore),
    provider: 'elliptic',
    scannedAt: Date.now(),
  };
}

/** Mock provider — safe for development / CI. */
async function scanViaMock(address) {
  // Treat addresses starting with "GBAN" as flagged for testing
  const flagged = address.startsWith('GBAN');
  return {
    address,
    riskScore: flagged ? 95 : 5,
    sanctioned: flagged,
    riskLevel: flagged ? 'severe' : 'low',
    provider: 'mock',
    scannedAt: Date.now(),
  };
}

function riskLevel(score) {
  if (score >= 90) return 'severe';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

// ── Core scan function ────────────────────────────────────────────────────────

/**
 * Scan a single address. Returns a cached result if available.
 * @param {string} address — Stellar public key (G...)
 * @returns {Promise<ScanResult>}
 */
async function scanAddress(address) {
  const cached = await getCached(address);
  if (cached) return { ...cached, fromCache: true };

  let result;
  switch (PROVIDER) {
    case 'trm':
      result = await scanViaTRM(address);
      break;
    case 'elliptic':
      result = await scanViaElliptic(address);
      break;
    default:
      result = await scanViaMock(address);
  }

  await setCached(address, result);
  return result;
}

// ── Audit logger ──────────────────────────────────────────────────────────────

function logScan(req, result, blocked) {
  const entry = {
    timestamp: new Date().toISOString(),
    requestId: req.id || req.headers['x-request-id'] || 'unknown',
    ip: req.ip,
    address: result.address,
    riskScore: result.riskScore,
    riskLevel: result.riskLevel,
    sanctioned: result.sanctioned,
    provider: result.provider,
    fromCache: result.fromCache ?? false,
    blocked,
    path: req.path,
    method: req.method,
  };

  // Use structured logging if available (pino / winston), else console
  if (req.log?.info) {
    req.log.info(entry, '[compliance] address scan');
  } else {
    console.info('[compliance]', JSON.stringify(entry));
  }
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Express middleware that screens `clientAddress` and `freelancerAddress`
 * from the request body before allowing escrow creation/funding.
 *
 * Attach to any route that creates or funds an escrow:
 *   router.post('/escrows', amlCheck, controller.create);
 */
export async function amlCheck(req, res, next) {
  const { clientAddress, freelancerAddress } = req.body ?? {};

  const addresses = [clientAddress, freelancerAddress].filter(Boolean);

  if (addresses.length === 0) {
    // No addresses to screen — let downstream validation handle missing fields
    return next();
  }

  let results;
  try {
    results = await Promise.all(addresses.map(scanAddress));
  } catch (err) {
    // AML provider unavailable — fail closed (block the request)
    console.error('[compliance] AML provider error:', err.message);
    return res.status(503).json({
      error: 'Compliance check temporarily unavailable. Please try again shortly.',
      code: 'AML_SERVICE_UNAVAILABLE',
    });
  }

  const blocked = results.filter((r) => r.sanctioned || r.riskScore >= RISK_THRESHOLD);

  // Log every scan
  for (const result of results) {
    logScan(
      req,
      result,
      blocked.some((b) => b.address === result.address),
    );
  }

  if (blocked.length > 0) {
    const flaggedAddresses = blocked.map((r) => ({
      address: r.address,
      reason: r.sanctioned ? 'sanctions_match' : 'risk_threshold_exceeded',
      riskLevel: r.riskLevel,
    }));

    return res.status(403).json({
      error: 'One or more addresses failed compliance screening.',
      code: 'AML_BLOCKED',
      flagged: flaggedAddresses,
    });
  }

  // Attach scan results to request for downstream use (e.g. audit logging)
  req.amlResults = results;
  next();
}

/**
 * Standalone utility: scan a single address outside of a request context.
 * Useful for background jobs or pre-flight checks.
 */
export { scanAddress };

// ── Integration tests ─────────────────────────────────────────────────────────
// Run with: NODE_ENV=test npx jest backend/api/middleware/compliance.test.js

export const _testExports = { getCached, setCached, riskLevel, scanViaMock };
