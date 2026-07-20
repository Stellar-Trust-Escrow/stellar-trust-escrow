/**
 * Dispute Evidence Service
 *
 * Manages evidence submission for disputes during the evidence_collection phase.
 */

import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('disputeEvidenceService');

const MAX_EVIDENCE_ITEMS = 5;

class DomainError extends Error {
  constructor(msg, code, status = 409) {
    super(msg);
    this.name = 'DomainError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Attach evidence to a dispute during the evidence_collection phase.
 *
 * @param {number} disputeId
 * @param {string} submitter - stellar address of the submitter
 * @param {{ evidenceHash?: string, ipfsCid?: string, description?: string }} payload
 * @param {string} tenantId
 */
export async function attachEvidence(
  disputeId,
  submitter,
  { evidenceHash, ipfsCid, description },
  tenantId,
) {
  const dispute = await prisma.dispute.findFirst({
    where: { id: disputeId, tenantId },
  });

  if (!dispute) {
    throw new DomainError('Dispute not found', 'DISPUTE_NOT_FOUND', 404);
  }

  if (dispute.status !== 'evidence_collection') {
    throw new DomainError('Evidence window is closed', 'WINDOW_CLOSED', 409);
  }

  const existingCount = await prisma.disputeEvidence.count({
    where: { disputeId, submittedBy: submitter },
  });

  if (existingCount >= MAX_EVIDENCE_ITEMS) {
    throw new DomainError(
      `Maximum of ${MAX_EVIDENCE_ITEMS} evidence items per party`,
      'EVIDENCE_LIMIT_REACHED',
      422,
    );
  }

  const evidence = await prisma.disputeEvidence.create({
    data: {
      tenantId,
      disputeId,
      submittedBy: submitter,
      role: 'party',
      evidenceType: ipfsCid ? 'ipfs' : 'hash',
      content: ipfsCid || evidenceHash || '',
      description: description || null,
      submittedAt: new Date(),
    },
  });

  log.info({ disputeId, submitter, evidenceId: evidence.id }, 'Evidence attached');
  return evidence;
}

/**
 * Get all evidence packages for a dispute.
 *
 * @param {number} disputeId
 */
export async function getEvidencePackages(disputeId) {
  return prisma.disputeEvidence.findMany({
    where: { disputeId },
    orderBy: { submittedAt: 'asc' },
  });
}

/**
 * Check whether an address has already submitted evidence for a dispute.
 *
 * @param {number} disputeId
 * @param {string} address
 * @returns {Promise<boolean>}
 */
export async function hasSubmitted(disputeId, address) {
  const count = await prisma.disputeEvidence.count({
    where: { disputeId, submittedBy: address },
  });
  return count > 0;
}
