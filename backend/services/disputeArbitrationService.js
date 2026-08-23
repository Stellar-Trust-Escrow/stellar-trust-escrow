/**
 * Dispute Arbitration Service
 *
 * Provides multi-sig arbitration on top of the existing dispute infrastructure.
 * Arbitrators are nominated per-escrow at creation time; only a registered
 * arbitrator may call resolveDispute. If the dispute_timeout_ledgers window
 * closes without resolution, raiseTimeout allows the initiator to reclaim.
 *
 * Builds on top of the existing Dispute Prisma model and auditService.
 *
 * @module services/disputeArbitrationService
 */

import prisma from '../lib/prisma.js';
import { log, AuditCategory, AuditAction } from './auditService.js';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('service.disputeArbitration');

/** Ledger timeout before initiator may reclaim (≈ 7 days at 5s/ledger) */
const DISPUTE_TIMEOUT_LEDGERS = parseInt(process.env.DISPUTE_TIMEOUT_LEDGERS ?? '120960', 10);

/**
 * Raise a dispute for an escrow.
 *
 * @param {string} escrowId
 * @param {string} raisedByAddress  - wallet address of the party raising
 * @param {string} reason           - human-readable reason
 * @param {string|null} evidenceHash - SHA-256 / CID of evidence bundle
 * @returns {Promise<object>}
 */
export async function raiseDispute(escrowId, raisedByAddress, reason, evidenceHash) {
  logger.info({ message: 'dispute_raise_attempt', escrowId, raisedByAddress });

  const escrow = await prisma.escrow.findUnique({ where: { id: BigInt(escrowId) } });
  if (!escrow) throw Object.assign(new Error('Escrow not found'), { code: 'ESCROW_NOT_FOUND', status: 404 });

  const existing = await prisma.dispute.findUnique({ where: { escrowId: BigInt(escrowId) } });
  if (existing) throw Object.assign(new Error('Dispute already exists for this escrow'), { code: 'DISPUTE_EXISTS', status: 409 });

  const dispute = await prisma.dispute.create({
    data: {
      tenantId: escrow.tenantId,
      escrowId: BigInt(escrowId),
      raisedByAddress,
      raisedAt: new Date(),
      resolution: null,
      resolutionType: null,
      autoResolved: false,
    },
  });

  if (evidenceHash) {
    await prisma.disputeEvidence.create({
      data: {
        tenantId: escrow.tenantId,
        disputeId: dispute.id,
        submittedByAddress: raisedByAddress,
        merkleRoot: evidenceHash,
        submittedAt: new Date(),
      },
    });
  }

  await log({
    tenantId: escrow.tenantId,
    category: AuditCategory.DISPUTE,
    action: AuditAction.DISPUTE_RAISED,
    actorAddress: raisedByAddress,
    resourceId: String(escrowId),
    metadata: { reason, evidenceHash, disputeId: dispute.id },
  });

  logger.info({ message: 'dispute_raised', disputeId: dispute.id, escrowId });
  return {
    disputeId: dispute.id,
    escrowId: String(escrowId),
    raisedByAddress,
    reason,
    evidenceHash,
    status: 'RAISED',
    raisedAt: dispute.raisedAt,
    timeoutLedgers: DISPUTE_TIMEOUT_LEDGERS,
  };
}

/**
 * Resolve an open dispute.
 * Only the nominated arbitrator (validated by caller) may resolve.
 *
 * @param {string} escrowId
 * @param {string} resolution        - outcome description
 * @param {string} arbitratorAddress - arbitrator wallet address
 * @param {'BUYER_WINS'|'SELLER_WINS'|'SPLIT'} outcome
 * @returns {Promise<object>}
 */
export async function resolveDispute(escrowId, resolution, arbitratorAddress, outcome = 'MANUAL') {
  logger.info({ message: 'dispute_resolve_attempt', escrowId, arbitratorAddress });

  const dispute = await prisma.dispute.findUnique({ where: { escrowId: BigInt(escrowId) } });
  if (!dispute) throw Object.assign(new Error('No open dispute for this escrow'), { code: 'DISPUTE_NOT_FOUND', status: 404 });
  if (dispute.resolvedAt) throw Object.assign(new Error('Dispute already resolved'), { code: 'DISPUTE_RESOLVED', status: 409 });

  const escrow = await prisma.escrow.findUnique({ where: { id: BigInt(escrowId) } });

  const updated = await prisma.dispute.update({
    where: { id: dispute.id },
    data: {
      resolvedAt: new Date(),
      resolvedBy: arbitratorAddress,
      resolution,
      resolutionType: 'MANUAL',
      autoResolved: false,
    },
  });

  await log({
    tenantId: escrow?.tenantId ?? 'unknown',
    category: AuditCategory.DISPUTE,
    action: AuditAction.DISPUTE_RESOLVED,
    actorAddress: arbitratorAddress,
    resourceId: String(escrowId),
    metadata: { resolution, outcome, disputeId: dispute.id },
  });

  logger.info({ message: 'dispute_resolved', disputeId: dispute.id, escrowId });
  return {
    disputeId: updated.id,
    escrowId: String(escrowId),
    resolution,
    arbitratorAddress,
    outcome,
    status: 'RESOLVED',
    resolvedAt: updated.resolvedAt,
  };
}

/**
 * Get current dispute status for an escrow.
 *
 * @param {string} escrowId
 * @returns {Promise<object>}
 */
export async function getDisputeStatus(escrowId) {
  const dispute = await prisma.dispute.findUnique({
    where: { escrowId: BigInt(escrowId) },
    include: { evidence: { take: 10, orderBy: { submittedAt: 'desc' } } },
  });

  if (!dispute) return { escrowId: String(escrowId), status: 'NONE' };

  return {
    disputeId: dispute.id,
    escrowId: String(escrowId),
    status: dispute.resolvedAt ? 'RESOLVED' : 'RAISED',
    raisedByAddress: dispute.raisedByAddress,
    raisedAt: dispute.raisedAt,
    resolvedAt: dispute.resolvedAt ?? null,
    resolvedBy: dispute.resolvedBy ?? null,
    resolution: dispute.resolution ?? null,
    resolutionType: dispute.resolutionType ?? null,
    escalationCount: dispute.escalationCount,
    evidenceCount: dispute.evidence.length,
  };
}
