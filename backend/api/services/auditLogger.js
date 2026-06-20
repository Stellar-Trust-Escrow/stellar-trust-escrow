/**
 * Arbitrator Audit Logger
 *
 * Tamper-evident audit log for arbitrator actions.
 * Each entry is linked to the previous one via a SHA-256 hash chain:
 *
 *   entry.hash = SHA256(prevHash + entry.id + entry.action + entry.actor + entry.timestamp + JSON(entry.metadata))
 *
 * This makes any retroactive modification detectable via `validateChain()`.
 *
 * Arbitrator actions logged:
 *   - DISPUTE_ASSIGNED      — dispute assigned to arbitrator
 *   - EVIDENCE_VIEWED       — arbitrator opened an evidence file
 *   - VOTE_CAST             — arbitrator voted on a proposal
 *   - COMMUNICATION_LOGGED  — arbitrator entered a communication record
 *   - RESOLUTION_ISSUED     — arbitrator issued a final resolution
 *
 * @module api/services/auditLogger
 */

import { createHash } from 'crypto';
import prisma from '../../lib/prisma.js';
import { createModuleLogger } from '../../config/logger.js';

const logger = createModuleLogger('auditLogger');

// ── Action constants ──────────────────────────────────────────────────────────

export const ArbitratorAction = {
  DISPUTE_ASSIGNED: 'DISPUTE_ASSIGNED',
  EVIDENCE_VIEWED: 'EVIDENCE_VIEWED',
  VOTE_CAST: 'VOTE_CAST',
  COMMUNICATION_LOGGED: 'COMMUNICATION_LOGGED',
  RESOLUTION_ISSUED: 'RESOLUTION_ISSUED',
};

// ── Hash chain helpers ────────────────────────────────────────────────────────

/** Genesis hash used when there is no previous entry. */
const GENESIS_HASH = '0'.repeat(64);

/**
 * Computes the hash for a single log entry.
 *
 * @param {string} prevHash   - Hash of the immediately preceding entry (or GENESIS_HASH).
 * @param {object} entry      - { id, action, actor, resourceId, timestamp, metadata }
 * @returns {string}          - Hex SHA-256 digest
 */
function computeHash(prevHash, entry) {
  const payload = [
    prevHash,
    String(entry.id),
    entry.action,
    entry.actor,
    entry.resourceId ?? '',
    entry.timestamp instanceof Date ? entry.timestamp.toISOString() : String(entry.timestamp),
    JSON.stringify(entry.metadata ?? {}),
  ].join('|');

  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Fetches the most recent arbitrator audit log entry to obtain the chain tip.
 * Returns GENESIS_HASH if no entries exist yet.
 *
 * @returns {Promise<string>}
 */
async function getChainTip() {
  const last = await prisma.arbitratorAuditLog.findFirst({
    orderBy: { id: 'desc' },
    select: { hash: true },
  });
  return last?.hash ?? GENESIS_HASH;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Appends a new arbitrator audit log entry.
 *
 * The entry is linked to the previous one via a hash chain.
 * Never throws — failures are logged to stderr so a logging error
 * never breaks the main request flow.
 *
 * @param {object} entry
 * @param {string} entry.action      - ArbitratorAction value
 * @param {string} entry.actor       - Stellar address of the arbitrator
 * @param {string} [entry.resourceId] - Dispute ID, evidence ID, etc.
 * @param {object} [entry.metadata]  - Arbitrary structured context
 * @param {string} [entry.ipAddress]
 * @returns {Promise<object|null>}   - Created record, or null on failure
 */
export async function logArbitratorAction(entry) {
  try {
    const prevHash = await getChainTip();
    const timestamp = new Date();

    // We need the auto-incremented id before we can compute the hash,
    // so we create the record first with a placeholder, then update.
    // Using a transaction ensures atomicity and prevents race conditions
    // that would break the chain under concurrent writes.
    const record = await prisma.$transaction(async (tx) => {
      // Lock the last row to serialise concurrent inserts
      const last = await tx.arbitratorAuditLog.findFirst({
        orderBy: { id: 'desc' },
        select: { id: true, hash: true },
      });
      const chainPrev = last?.hash ?? GENESIS_HASH;

      // Create with placeholder hash
      const created = await tx.arbitratorAuditLog.create({
        data: {
          action: entry.action,
          actor: entry.actor,
          resourceId: entry.resourceId ?? null,
          metadata: entry.metadata ?? undefined,
          ipAddress: entry.ipAddress ?? null,
          timestamp,
          prevHash: chainPrev,
          hash: 'pending', // replaced below
        },
      });

      const hash = computeHash(chainPrev, {
        id: created.id,
        action: created.action,
        actor: created.actor,
        resourceId: created.resourceId,
        timestamp: created.timestamp,
        metadata: created.metadata,
      });

      return tx.arbitratorAuditLog.update({
        where: { id: created.id },
        data: { hash },
      });
    });

    return record;
  } catch (err) {
    logger.error({
      message: 'arbitrator_audit_write_failed',
      error: err.message,
      stack: err.stack,
    });
    return null;
  }
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validates the integrity of the entire arbitrator audit log chain.
 *
 * Iterates all entries in insertion order and recomputes each hash.
 * Returns a result object describing any tampering detected.
 *
 * @returns {Promise<{ valid: boolean, checkedCount: number, firstViolation: object|null }>}
 */
export async function validateChain() {
  const entries = await prisma.arbitratorAuditLog.findMany({
    orderBy: { id: 'asc' },
  });

  let prevHash = GENESIS_HASH;
  let firstViolation = null;

  for (const entry of entries) {
    // Verify prevHash linkage
    if (entry.prevHash !== prevHash) {
      firstViolation = {
        id: entry.id,
        reason: 'prevHash_mismatch',
        expected: prevHash,
        actual: entry.prevHash,
      };
      break;
    }

    // Recompute and verify hash
    const expected = computeHash(prevHash, {
      id: entry.id,
      action: entry.action,
      actor: entry.actor,
      resourceId: entry.resourceId,
      timestamp: entry.timestamp,
      metadata: entry.metadata,
    });

    if (expected !== entry.hash) {
      firstViolation = {
        id: entry.id,
        reason: 'hash_mismatch',
        expected,
        actual: entry.hash,
      };
      break;
    }

    prevHash = entry.hash;
  }

  return {
    valid: firstViolation === null,
    checkedCount: entries.length,
    firstViolation,
  };
}

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Retrieves paginated arbitrator audit logs for the admin panel.
 *
 * @param {object} filters
 * @param {string}  [filters.actor]
 * @param {string}  [filters.action]
 * @param {string}  [filters.resourceId]
 * @param {string}  [filters.from]   - ISO date
 * @param {string}  [filters.to]     - ISO date
 * @param {number}  [filters.page=1]
 * @param {number}  [filters.limit=50]
 * @returns {Promise<{ data, total, page, limit, pages }>}
 */
export async function queryLogs(filters = {}) {
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 50));
  const skip = (page - 1) * limit;

  const where = {};
  if (filters.actor) where.actor = { contains: filters.actor, mode: 'insensitive' };
  if (filters.action) where.action = filters.action;
  if (filters.resourceId) where.resourceId = { contains: filters.resourceId, mode: 'insensitive' };
  if (filters.from || filters.to) {
    where.timestamp = {};
    if (filters.from) where.timestamp.gte = new Date(filters.from);
    if (filters.to) where.timestamp.lte = new Date(filters.to);
  }

  const [data, total] = await prisma.$transaction([
    prisma.arbitratorAuditLog.findMany({ where, skip, take: limit, orderBy: { id: 'desc' } }),
    prisma.arbitratorAuditLog.count({ where }),
  ]);

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

export default { logArbitratorAction, validateChain, queryLogs, ArbitratorAction };
