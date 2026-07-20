/**
 * Dispute Resolution Service
 *
 * Manages the full dispute lifecycle:
 *   open → evidence_collection → arbiter_review → ruled → appeal_window → final/appealed
 */

import prisma from '../lib/prisma.js';
import { scheduleEvidenceExpiry, scheduleAppealExpiry } from '../queues/disputeTimerQueue.js';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('disputeResolution');

const EVIDENCE_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours
const APPEAL_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours

class DomainError extends Error {
  constructor(msg, code, status = 409) {
    super(msg);
    this.name = 'DomainError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Open a new dispute, entering the evidence_collection phase.
 */
export async function openDispute({
  escrowId,
  milestoneIndex,
  reason,
  evidenceHash,
  raisedByAddress,
  tenantId,
}) {
  const now = new Date();
  const evidenceDeadlineAt = new Date(now.getTime() + EVIDENCE_WINDOW_MS);

  const dispute = await prisma.dispute.create({
    data: {
      tenantId,
      escrowId: typeof escrowId === 'bigint' ? escrowId : BigInt(escrowId),
      raisedByAddress,
      raisedAt: now,
      resolution: reason || null,
      status: 'evidence_collection',
      evidenceDeadlineAt,
    },
  });

  log.info({ disputeId: dispute.id, escrowId }, 'Dispute opened, evidence window started');

  await scheduleEvidenceExpiry(dispute.id, EVIDENCE_WINDOW_MS);

  // Convert BigInt escrowId to string for safe JSON serialization
  return {
    ...dispute,
    escrowId: dispute.escrowId != null ? String(dispute.escrowId) : null,
  };
}

/**
 * Assign an arbiter to a dispute, transitioning to arbiter_review.
 */
export async function assignArbiter({ disputeId, arbiterAddress, tenantId }) {
  const dispute = await prisma.dispute.findFirst({
    where: { id: disputeId, tenantId },
  });

  if (!dispute) {
    throw new DomainError('Dispute not found', 'DISPUTE_NOT_FOUND', 404);
  }

  if (!['evidence_collection', 'open'].includes(dispute.status)) {
    throw new DomainError(
      `Cannot assign arbiter in status: ${dispute.status}`,
      'INVALID_STATUS',
      409,
    );
  }

  const updated = await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      arbiter: arbiterAddress,
      status: 'arbiter_review',
    },
  });

  log.info({ disputeId, arbiterAddress }, 'Arbiter assigned');
  return updated;
}

/**
 * Submit an arbiter ruling with a client/freelancer split.
 */
export async function submitRuling({
  disputeId,
  arbiterAddress,
  clientPct,
  freelancerPct,
  reasoning,
  tenantId,
}) {
  const dispute = await prisma.dispute.findFirst({
    where: { id: disputeId, tenantId },
  });

  if (!dispute) {
    throw new DomainError('Dispute not found', 'DISPUTE_NOT_FOUND', 404);
  }

  if (dispute.status !== 'arbiter_review') {
    throw new DomainError(`Cannot rule in status: ${dispute.status}`, 'INVALID_STATUS', 409);
  }

  if (dispute.arbiter !== arbiterAddress) {
    throw new DomainError('Not the assigned arbiter', 'UNAUTHORIZED_ARBITER', 403);
  }

  if (clientPct + freelancerPct !== 100) {
    throw new DomainError('clientPct + freelancerPct must equal 100', 'INVALID_SPLIT', 422);
  }

  const now = new Date();
  const appealDeadlineAt = new Date(now.getTime() + APPEAL_WINDOW_MS);

  const ruling = await prisma.disputeRuling.create({
    data: {
      disputeId,
      arbiter: arbiterAddress,
      clientPct,
      freelancerPct,
      reasoning,
      ruledAt: now,
    },
  });

  await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status: 'ruled',
      appealDeadlineAt,
      clientAmount: String(clientPct),
      freelancerAmount: String(freelancerPct),
      resolvedBy: arbiterAddress,
    },
  });

  log.info({ disputeId, clientPct, freelancerPct }, 'Ruling submitted');
  await scheduleAppealExpiry(disputeId, APPEAL_WINDOW_MS);

  return ruling;
}

/**
 * File an appeal against a ruling. Dispute must be in 'appeal_window' or 'ruled' status.
 */
export async function fileAppeal({
  disputeId,
  groundsText,
  evidenceHash,
  appellantAddress,
  tenantId,
}) {
  const dispute = await prisma.dispute.findFirst({
    where: { id: disputeId, tenantId },
  });

  if (!dispute) {
    throw new DomainError('Dispute not found', 'DISPUTE_NOT_FOUND', 404);
  }

  if (!['appeal_window', 'ruled'].includes(dispute.status)) {
    throw new DomainError('Dispute is not in the appeal window', 'NOT_IN_APPEAL_WINDOW', 409);
  }

  const appeal = await prisma.disputeAppeal.create({
    data: {
      tenantId,
      disputeId,
      appealedBy: appellantAddress,
      reason: groundsText,
      status: 'pending',
      createdAt: new Date(),
    },
  });

  await prisma.dispute.update({
    where: { id: disputeId },
    data: { status: 'appealed' },
  });

  log.info({ disputeId, appellantAddress }, 'Appeal filed');
  return appeal;
}

/**
 * Finalize a dispute — idempotent, called by BullMQ timer or admin.
 */
export async function finalizeDispute({ disputeId, tenantId }) {
  const where = tenantId ? { id: disputeId, tenantId } : { id: disputeId };

  const dispute = await prisma.dispute.findFirst({ where });

  if (!dispute) {
    log.warn({ disputeId }, 'finalizeDispute: dispute not found, no-op');
    return null;
  }

  if (!['ruled', 'appeal_window'].includes(dispute.status)) {
    log.info(
      { disputeId, status: dispute.status },
      'finalizeDispute: status not finalizable, no-op',
    );
    return dispute;
  }

  const updated = await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status: 'final',
      resolvedAt: new Date(),
    },
  });

  log.info({ disputeId }, 'Dispute finalized');
  return updated;
}

/**
 * Get a single dispute with evidence and appeals.
 */
export async function getDispute({ disputeId, tenantId }) {
  const dispute = await prisma.dispute.findFirst({
    where: { id: disputeId, tenantId },
    include: {
      evidence: true,
      appeals: true,
    },
  });

  if (!dispute) {
    throw new DomainError('Dispute not found', 'DISPUTE_NOT_FOUND', 404);
  }

  return dispute;
}

/**
 * Paginated list of disputes for a tenant.
 */
export async function listDisputes({ tenantId, page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;

  const [disputes, total] = await Promise.all([
    prisma.dispute.findMany({
      where: { tenantId },
      skip,
      take: limit,
      orderBy: { raisedAt: 'desc' },
      include: { evidence: true, appeals: true },
    }),
    prisma.dispute.count({ where: { tenantId } }),
  ]);

  return { disputes, total, page, limit };
}

export { DomainError };
