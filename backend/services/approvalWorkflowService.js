/**
 * Approval Workflow Service
 *
 * Implements N-of-M off-chain approval collection with Stellar Ed25519 signature
 * verification. Once the configured threshold is reached, triggers an on-chain
 * milestone release.
 */

import crypto from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';
import { scheduleExpiry } from '../queues/approvalQueue.js';

const logger = createModuleLogger('approvalWorkflow');

// ── Domain error ──────────────────────────────────────────────────────────────

class DomainError extends Error {
  constructor(message, code, status = 409) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = status;
  }
}

// ── Signature verification ────────────────────────────────────────────────────

/**
 * Verify a Stellar Ed25519 signature over `approve:<requestId>:<milestoneIndex>`.
 *
 * Verification is skipped when NODE_ENV=test or SKIP_SIG_VERIFY=true so unit
 * tests can run without real key material.
 *
 * @param {string} requestId
 * @param {number} milestoneIndex
 * @param {string} signatureProof  — base64-encoded signature bytes
 * @param {string} approverAddress — Stellar public key (G…)
 * @returns {boolean}
 */
function verifySignature(requestId, milestoneIndex, signatureProof, approverAddress) {
  if (process.env.NODE_ENV === 'test' || process.env.SKIP_SIG_VERIFY === 'true') return true;
  try {
    const kp = Keypair.fromPublicKey(approverAddress);
    const msg = Buffer.from(`approve:${requestId}:${milestoneIndex}`);
    const sig = Buffer.from(signatureProof, 'base64');
    return kp.verify(msg, sig);
  } catch {
    return false;
  }
}

// ── On-chain trigger (stub) ───────────────────────────────────────────────────

async function triggerOnChainRelease(requestId) {
  const mockTxHash = `mock-tx-${crypto.randomUUID()}`;
  await prisma.approvalRequest.update({
    where: { id: requestId },
    data: { txHash: mockTxHash },
  });
  logger.info(
    { requestId, txHash: mockTxHash },
    '[Approval] On-chain release triggered for requestId',
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a new approval request for a milestone.
 *
 * @param {object} params
 * @param {string}   params.escrowId
 * @param {number}   params.milestoneIndex
 * @param {string[]} params.requiredApprovers
 * @param {number}   params.threshold
 * @param {Date}     params.deadlineAt
 * @param {string}   params.initiatedBy
 */
export async function createApprovalRequest({
  escrowId,
  milestoneIndex,
  requiredApprovers,
  threshold,
  deadlineAt,
  initiatedBy,
}) {
  if (!Array.isArray(requiredApprovers) || requiredApprovers.length === 0) {
    throw new DomainError('requiredApprovers must be a non-empty array', 'INVALID_APPROVERS', 400);
  }
  if (typeof threshold !== 'number' || threshold <= 0 || threshold > requiredApprovers.length) {
    throw new DomainError(
      'threshold must be between 1 and requiredApprovers.length',
      'INVALID_THRESHOLD',
      400,
    );
  }

  const id = crypto.randomUUID();

  const request = await prisma.approvalRequest.create({
    data: {
      id,
      escrowId,
      milestoneIndex,
      requiredApprovers,
      threshold,
      approvalCount: 0,
      status: 'pending',
      initiatedBy,
      deadlineAt: new Date(deadlineAt),
    },
  });

  await scheduleExpiry(id, deadlineAt);

  logger.info({ requestId: id, escrowId, threshold }, '[Approval] Request created');

  return request;
}

/**
 * Record an approver's positive vote.
 *
 * @param {string} requestId
 * @param {string} approverAddress
 * @param {string} signatureProof
 */
export async function recordApproval(requestId, approverAddress, signatureProof) {
  const request = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    throw new DomainError('Approval request not found', 'NOT_FOUND', 404);
  }
  if (request.status !== 'pending') {
    throw new DomainError(
      `Request is already ${request.status}`,
      `REQUEST_${request.status.toUpperCase()}`,
    );
  }
  if (new Date(request.deadlineAt) < new Date()) {
    throw new DomainError('Approval request has expired', 'REQUEST_EXPIRED');
  }

  const approvers = request.requiredApprovers ?? [];
  if (!approvers.includes(approverAddress)) {
    throw new DomainError('Address is not in the approver list', 'NOT_IN_APPROVER_LIST', 403);
  }

  // Check for duplicate vote
  const existing = await prisma.approvalRecord.findFirst({
    where: { requestId, approverAddress },
  });
  if (existing) {
    throw new DomainError('Approver has already voted on this request', 'ALREADY_APPROVED');
  }

  if (!verifySignature(requestId, request.milestoneIndex, signatureProof, approverAddress)) {
    throw new DomainError('Signature verification failed', 'INVALID_SIGNATURE', 401);
  }

  // Record the vote
  await prisma.approvalRecord.create({
    data: {
      id: crypto.randomUUID(),
      requestId,
      approverAddress,
      signatureProof,
      decision: 'approved',
      recordedAt: new Date(),
    },
  });

  // Increment count
  const updated = await prisma.approvalRequest.update({
    where: { id: requestId },
    data: { approvalCount: { increment: 1 } },
  });

  const thresholdReached = updated.approvalCount >= updated.threshold;

  if (thresholdReached) {
    await prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'approved' },
    });
    await triggerOnChainRelease(requestId);
    logger.info({ requestId }, '[Approval] Threshold reached — request approved');
  }

  return { approved: true, threshold_reached: thresholdReached };
}

/**
 * Record a rejector's negative vote. One rejection is sufficient to close the request.
 *
 * @param {string} requestId
 * @param {string} rejectorAddress
 * @param {string} [reason]
 */
export async function recordRejection(requestId, rejectorAddress, reason) {
  const request = await prisma.approvalRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    throw new DomainError('Approval request not found', 'NOT_FOUND', 404);
  }
  if (request.status !== 'pending') {
    throw new DomainError(
      `Request is already ${request.status}`,
      `REQUEST_${request.status.toUpperCase()}`,
    );
  }
  if (new Date(request.deadlineAt) < new Date()) {
    throw new DomainError('Approval request has expired', 'REQUEST_EXPIRED');
  }

  const approvers = request.requiredApprovers ?? [];
  if (!approvers.includes(rejectorAddress)) {
    throw new DomainError('Address is not in the approver list', 'NOT_IN_APPROVER_LIST', 403);
  }

  await prisma.approvalRecord.create({
    data: {
      id: crypto.randomUUID(),
      requestId,
      approverAddress: rejectorAddress,
      signatureProof: '',
      decision: 'rejected',
      reason: reason ?? null,
      recordedAt: new Date(),
    },
  });

  const updated = await prisma.approvalRequest.update({
    where: { id: requestId },
    data: { status: 'rejected' },
  });

  logger.info({ requestId, rejectorAddress }, '[Approval] Request rejected');

  return updated;
}

/**
 * Mark all pending requests whose deadline has passed as expired.
 *
 * @returns {Promise<number>} number of records updated
 */
export async function expireOverdueRequests() {
  const result = await prisma.approvalRequest.updateMany({
    where: {
      status: 'pending',
      deadlineAt: { lt: new Date() },
    },
    data: { status: 'expired' },
  });
  logger.info({ count: result.count }, '[Approval] Expired overdue requests');
  return result.count;
}

/**
 * Fetch a single approval request with its records.
 *
 * @param {string} requestId
 */
export async function getRequest(requestId) {
  return prisma.approvalRequest.findUnique({
    where: { id: requestId },
    include: { records: true },
  });
}

/**
 * List approval requests with optional filters and pagination.
 *
 * @param {object} params
 * @param {string} [params.escrowId]
 * @param {string} [params.status]
 * @param {number} [params.page=1]
 * @param {number} [params.limit=20]
 */
export async function listRequests({ escrowId, status, page = 1, limit = 20 } = {}) {
  const where = {};
  if (escrowId) where.escrowId = escrowId;
  if (status) where.status = status;

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.approvalRequest.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.approvalRequest.count({ where }),
  ]);

  return { items, total, page, limit };
}
