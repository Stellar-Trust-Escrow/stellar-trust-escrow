/**
 * Audit Log Integrity Verification Service
 *
 * Runs an hourly worker that reconstructs the SHA-256 hash chain over the
 * AuditLog table and compares it against the stored root hash. Any discrepancy
 * indicates that a log entry was inserted, deleted, or modified out-of-band.
 *
 * Hash chain construction (per tenant, ordered by id ASC):
 *   entry_hash[0] = SHA-256(GENESIS || id || tenantId || category || action || actor || createdAt)
 *   entry_hash[n] = SHA-256(entry_hash[n-1] || id || tenantId || category || action || actor || createdAt)
 *
 * The final entry_hash is the "root hash" for that tenant's log chain.
 * Root hashes are stored in the AuditChainRoot table (created by migration if absent).
 *
 * On discrepancy:
 *  1. Logs a CRITICAL alert via the module logger.
 *  2. Emits an 'audit:chain:violation' event on the global process EventEmitter.
 *  3. Sets a Redis flag `audit:lock:<tenantId>` that middleware can check to
 *     block sensitive administrative operations.
 *
 * Environment variables:
 *  AUDIT_VERIFY_INTERVAL_MS   Worker interval in ms (default: 3600000 = 1 hour)
 *  AUDIT_BATCH_SIZE           Rows fetched per DB query (default: 500)
 *  REDIS_URL                  Redis connection string (optional; lock skipped if absent)
 *  AUDIT_LOCK_TTL_SEC         Lock TTL in seconds (default: 7200 = 2 hours)
 *
 * @module services/auditVerifier
 */

import { createHash } from 'crypto';
import { EventEmitter } from 'events';
import { createClient } from 'redis';
import { createModuleLogger } from '../config/logger.js';
import prisma from '../lib/prisma.js';

const logger = createModuleLogger('service.auditVerifier');

// ── Configuration ─────────────────────────────────────────────────────────────

const VERIFY_INTERVAL = parseInt(process.env.AUDIT_VERIFY_INTERVAL_MS || '3600000', 10);
const BATCH_SIZE = parseInt(process.env.AUDIT_BATCH_SIZE || '500', 10);
const LOCK_TTL = parseInt(process.env.AUDIT_LOCK_TTL_SEC || '7200', 10);
const GENESIS = 'STELLAR_TRUST_ESCROW_AUDIT_GENESIS';

// ── Event bus ─────────────────────────────────────────────────────────────────

export const auditEvents = new EventEmitter();

// ── Redis client ──────────────────────────────────────────────────────────────

let redis = null;

if (process.env.REDIS_URL) {
  redis = createClient({ url: process.env.REDIS_URL });
  redis.on('error', (err) => logger.error({ err }, 'Redis error in auditVerifier'));
  redis.connect().catch((err) => {
    logger.warn({ err }, 'Redis unavailable; admin locking disabled');
    redis = null;
  });
}

// ── Hash chain helpers ────────────────────────────────────────────────────────

/**
 * Compute the SHA-256 hash of a single audit log entry chained to the previous hash.
 *
 * @param {string} prevHash - Hex digest of the previous entry (or GENESIS for first).
 * @param {object} entry    - AuditLog row.
 * @returns {string} Hex digest.
 */
function computeEntryHash(prevHash, entry) {
  return createHash('sha256')
    .update(prevHash)
    .update(String(entry.id))
    .update(entry.tenantId)
    .update(entry.category)
    .update(entry.action)
    .update(entry.actor)
    .update(entry.createdAt.toISOString())
    .digest('hex');
}

/**
 * Reconstruct the root hash for a tenant by streaming all log entries in batches.
 *
 * @param {string} tenantId
 * @returns {Promise<{ rootHash: string, count: number }>}
 */
async function computeChainRoot(tenantId) {
  let cursor = BigInt(0);
  let prevHash = GENESIS;
  let count = 0;

  while (true) {
    const batch = await prisma.auditLog.findMany({
      where: { tenantId, id: { gt: cursor } },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      select: {
        id: true,
        tenantId: true,
        category: true,
        action: true,
        actor: true,
        createdAt: true,
      },
    });

    if (batch.length === 0) break;

    for (const entry of batch) {
      prevHash = computeEntryHash(prevHash, entry);
      count++;
    }

    cursor = batch[batch.length - 1].id;
    if (batch.length < BATCH_SIZE) break;
  }

  return { rootHash: prevHash, count };
}

// ── Admin lock ────────────────────────────────────────────────────────────────

const LOCK_KEY_PREFIX = 'audit:lock:';

/**
 * Set a Redis flag that blocks sensitive admin operations for a tenant.
 *
 * @param {string} tenantId
 */
async function lockAdminFeatures(tenantId) {
  if (!redis) {
    logger.warn({ tenantId }, 'Redis unavailable; cannot set admin lock');
    return;
  }
  try {
    await redis.set(`${LOCK_KEY_PREFIX}${tenantId}`, '1', { EX: LOCK_TTL });
    logger.warn({ tenantId }, 'Admin features locked due to audit chain violation');
  } catch (err) {
    logger.error({ err, tenantId }, 'Failed to set admin lock in Redis');
  }
}

/**
 * Check whether admin features are locked for a tenant.
 *
 * @param {string} tenantId
 * @returns {Promise<boolean>}
 */
export async function isAdminLocked(tenantId) {
  if (!redis) return false;
  try {
    const val = await redis.get(`${LOCK_KEY_PREFIX}${tenantId}`);
    return val === '1';
  } catch {
    return false;
  }
}

/**
 * Manually release the admin lock for a tenant (e.g. after manual remediation).
 *
 * @param {string} tenantId
 */
export async function releaseAdminLock(tenantId) {
  if (!redis) return;
  await redis.del(`${LOCK_KEY_PREFIX}${tenantId}`);
  logger.info({ tenantId }, 'Admin lock released');
}

// ── Root hash persistence ─────────────────────────────────────────────────────

/**
 * Upsert the stored root hash for a tenant.
 * Uses a raw query so we don't need a Prisma model migration for this service.
 *
 * @param {string} tenantId
 * @param {string} rootHash
 * @param {number} entryCount
 */
async function upsertStoredRoot(tenantId, rootHash, entryCount) {
  await prisma.$executeRawUnsafe(
    `INSERT INTO audit_chain_roots (tenant_id, root_hash, entry_count, verified_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (tenant_id)
     DO UPDATE SET root_hash = $2, entry_count = $3, verified_at = NOW()`,
    tenantId,
    rootHash,
    entryCount,
  );
}

/**
 * Retrieve the stored root hash for a tenant.
 *
 * @param {string} tenantId
 * @returns {Promise<{ rootHash: string, entryCount: number } | null>}
 */
async function getStoredRoot(tenantId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT root_hash, entry_count FROM audit_chain_roots WHERE tenant_id = $1`,
    tenantId,
  );
  if (!rows || rows.length === 0) return null;
  return { rootHash: rows[0].root_hash, entryCount: Number(rows[0].entry_count) };
}

// ── Verification worker ───────────────────────────────────────────────────────

/**
 * Verify the audit log chain for a single tenant.
 *
 * @param {string} tenantId
 */
async function verifyTenant(tenantId) {
  const start = Date.now();
  logger.debug({ tenantId }, 'Starting audit chain verification');

  const { rootHash, count } = await computeChainRoot(tenantId);
  const stored = await getStoredRoot(tenantId);

  if (!stored) {
    // First run — store the baseline
    await upsertStoredRoot(tenantId, rootHash, count);
    logger.info({ tenantId, count }, 'Audit chain baseline established');
    return;
  }

  if (stored.rootHash !== rootHash || stored.entryCount !== count) {
    logger.error(
      {
        tenantId,
        storedHash: stored.rootHash,
        computedHash: rootHash,
        storedCount: stored.entryCount,
        computedCount: count,
      },
      'CRITICAL: Audit chain violation detected — log tampering suspected',
    );

    // Emit event for external listeners (e.g. incident service, alerting)
    auditEvents.emit('audit:chain:violation', {
      tenantId,
      storedHash: stored.rootHash,
      computedHash: rootHash,
      storedCount: stored.entryCount,
      computedCount: count,
      detectedAt: new Date().toISOString(),
    });

    // Lock sensitive admin features
    await lockAdminFeatures(tenantId);
  } else {
    // Update verified_at timestamp
    await upsertStoredRoot(tenantId, rootHash, count);
    logger.info({ tenantId, count, durationMs: Date.now() - start }, 'Audit chain verified OK');
  }
}

/**
 * Run a full verification pass across all tenants.
 */
export async function runVerification() {
  logger.info('Audit chain verification pass started');
  const tenants = await prisma.tenant.findMany({ select: { id: true } });

  for (const { id: tenantId } of tenants) {
    try {
      await verifyTenant(tenantId);
    } catch (err) {
      logger.error({ err, tenantId }, 'Audit verification failed for tenant');
    }
  }

  logger.info('Audit chain verification pass complete');
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let _timer = null;

/**
 * Start the hourly verification worker.
 * Safe to call multiple times — only one timer is active.
 */
export function startVerificationWorker() {
  if (_timer) return;
  _timer = setInterval(runVerification, VERIFY_INTERVAL);
  // Unref so the timer doesn't prevent process exit in tests
  if (_timer.unref) _timer.unref();
  logger.info({ intervalMs: VERIFY_INTERVAL }, 'Audit verification worker started');
}

/** Stop the verification worker (useful in tests). */
export function stopVerificationWorker() {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}

export default {
  runVerification,
  startVerificationWorker,
  stopVerificationWorker,
  isAdminLocked,
  releaseAdminLock,
  auditEvents,
};
