/**
 * Dispute Resolution Service
 *
 * Implements automated dispute resolution via a rules engine.
 * Simple cases are resolved automatically; complex ones are escalated
 * to a human arbiter/admin.
 *
 * Resolution flow:
 *   1. Collect evidence submitted by both parties
 *   2. Run rule evaluators in priority order
 *   3. If a rule fires with sufficient confidence → auto-resolve
 *   4. Otherwise → escalate (mark as ESCALATED, notify admin)
 *
 * @module services/disputeResolution
 */

import prisma from '../lib/prisma.js';
import { log, AuditCategory, AuditAction } from './auditService.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const ResolutionType = {
  AUTO: 'AUTO',
  MANUAL: 'MANUAL',
  ESCALATED: 'ESCALATED',
};

/** Minimum confidence score (0–1) required to auto-resolve without escalation. */
const AUTO_RESOLVE_THRESHOLD = 0.75;

// ── Rule Evaluators ───────────────────────────────────────────────────────────

/**
 * Each rule returns { fires: boolean, confidence: number (0–1),
 *                     clientSplit: number (0–1), resolution: string }
 * Rules are evaluated in order; the first that fires above threshold wins.
 */
const rules = [
  /**
   * Rule: No evidence submitted by one party.
   * If only one side submitted evidence, favour that party strongly.
   */
  {
    name: 'one_sided_evidence',
    evaluate(evidence, _escrow) {
      const clientEvidence = evidence.filter((e) => e.role === 'client');
      const freelancerEvidence = evidence.filter((e) => e.role === 'freelancer');

      if (clientEvidence.length > 0 && freelancerEvidence.length === 0) {
        return {
          fires: true,
          confidence: 0.85,
          clientSplit: 1.0,
          resolution: 'Client submitted evidence; freelancer provided none. Resolved in favour of client.',
        };
      }
      if (freelancerEvidence.length > 0 && clientEvidence.length === 0) {
        return {
          fires: true,
          confidence: 0.85,
          clientSplit: 0.0,
          resolution: 'Freelancer submitted evidence; client provided none. Resolved in favour of freelancer.',
        };
      }
      return { fires: false };
    },
  },

  /**
   * Rule: No evidence from either party after submission window.
   * Split 50/50 when neither party engages.
   */
  {
    name: 'no_evidence',
    evaluate(evidence, escrow) {
      if (evidence.length === 0) {
        const hoursOpen = (Date.now() - new Date(escrow.raisedAt).getTime()) / 3_600_000;
        if (hoursOpen >= 72) {
          return {
            fires: true,
            confidence: 0.80,
            clientSplit: 0.5,
            resolution: 'No evidence submitted by either party within 72 hours. Amount split equally.',
          };
        }
      }
      return { fires: false };
    },
  },

  /**
   * Rule: Milestone was approved on-chain before dispute was raised.
   * Favour freelancer — work was accepted.
   */
  {
    name: 'milestone_approved_before_dispute',
    evaluate(evidence, escrow) {
      const hasApprovedMilestone = escrow.milestones?.some(
        (m) => m.status === 'Approved' && m.resolvedAt && new Date(m.resolvedAt) < new Date(escrow.raisedAt),
      );
      if (hasApprovedMilestone) {
        return {
          fires: true,
          confidence: 0.90,
          clientSplit: 0.0,
          resolution: 'At least one milestone was approved on-chain before the dispute was raised. Resolved in favour of freelancer.',
        };
      }
      return { fires: false };
    },
  },

  /**
   * Rule: Escrow deadline passed with no milestone submissions.
   * Favour client — work was not delivered.
   */
  {
    name: 'deadline_passed_no_submission',
    evaluate(evidence, escrow) {
      if (!escrow.deadline) return { fires: false };
      const deadlinePassed = new Date(escrow.deadline) < new Date();
      const noSubmissions = !escrow.milestones?.some((m) => m.status !== 'Pending');
      if (deadlinePassed && noSubmissions) {
        return {
          fires: true,
          confidence: 0.88,
          clientSplit: 1.0,
          resolution: 'Escrow deadline passed with no milestone submissions. Resolved in favour of client.',
        };
      }
      return { fires: false };
    },
  },
];

// ── Core Engine ───────────────────────────────────────────────────────────────

/**
 * Run the rules engine against a dispute.
 *
 * @param {object} dispute  - Dispute record with escrow + milestones included
 * @param {Array}  evidence - DisputeEvidence records for this dispute
 * @returns {{ shouldAutoResolve: boolean, rule: string|null, confidence: number,
 *             clientSplit: number, resolution: string }}
 */
export function evaluateRules(dispute, evidence) {
  const escrow = { ...dispute.escrow, raisedAt: dispute.raisedAt };

  for (const rule of rules) {
    const result = rule.evaluate(evidence, escrow);
    if (result.fires && result.confidence >= AUTO_RESOLVE_THRESHOLD) {
      return {
        shouldAutoResolve: true,
        rule: rule.name,
        confidence: result.confidence,
        clientSplit: result.clientSplit,
        resolution: result.resolution,
      };
    }
  }

  return {
    shouldAutoResolve: false,
    rule: null,
    confidence: 0,
    clientSplit: 0.5,
    resolution: 'No automated rule reached sufficient confidence. Escalated for manual review.',
  };
}

/**
 * Compute split amounts from a clientSplit ratio and total escrow amount.
 *
 * @param {string} totalAmount  - BigInt-as-string
 * @param {number} clientSplit  - 0.0 to 1.0
 * @returns {{ clientAmount: string, freelancerAmount: string }}
 */
function computeSplitAmounts(totalAmount, clientSplit) {
  const total = BigInt(totalAmount);
  const clientBig = (total * BigInt(Math.round(clientSplit * 10_000))) / BigInt(10_000);
  const freelancerBig = total - clientBig;
  return {
    clientAmount: clientBig.toString(),
    freelancerAmount: freelancerBig.toString(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Submit evidence for a dispute.
 *
 * @param {number} disputeId
 * @param {object} payload
 * @param {string} payload.submittedBy  - Stellar address
 * @param {string} payload.role         - client | freelancer | arbiter | admin
 * @param {string} payload.evidenceType - text | url | hash
 * @param {string} payload.content
 * @param {string} [payload.description]
 * @returns {Promise<object>} Created evidence record
 */
export async function submitEvidence(disputeId, payload) {
  const { submittedBy, role, evidenceType, content, description } = payload;

  const VALID_ROLES = ['client', 'freelancer', 'arbiter', 'admin'];
  const VALID_TYPES = ['text', 'url', 'hash'];

  if (!VALID_ROLES.includes(role)) throw new Error(`Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`);
  if (!VALID_TYPES.includes(evidenceType)) throw new Error(`Invalid evidenceType. Must be one of: ${VALID_TYPES.join(', ')}`);
  if (!content?.trim()) throw new Error('content is required');

  const dispute = await prisma.dispute.findUnique({ where: { id: disputeId } });
  if (!dispute) throw new Error('Dispute not found');
  if (dispute.resolvedAt) throw new Error('Cannot submit evidence for a resolved dispute');

  const evidence = await prisma.disputeEvidence.create({
    data: { disputeId, submittedBy, role, evidenceType, content: content.trim(), description: description ?? null },
  });

  await log({
    category: AuditCategory.DISPUTE,
    action: 'SUBMIT_EVIDENCE',
    actor: submittedBy,
    resourceId: String(disputeId),
    metadata: { evidenceId: evidence.id, role, evidenceType },
  });

  return evidence;
}

/**
 * Run automated resolution on a dispute.
 * Resolves automatically if rules fire with sufficient confidence,
 * otherwise marks the dispute as ESCALATED.
 *
 * @param {number} disputeId
 * @returns {Promise<{ resolved: boolean, resolutionType: string, dispute: object }>}
 */
export async function runAutomatedResolution(disputeId) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      escrow: { include: { milestones: true } },
      evidence: true,
    },
  });

  if (!dispute) throw new Error('Dispute not found');
  if (dispute.resolvedAt) throw new Error('Dispute is already resolved');

  const evaluation = evaluateRules(dispute, dispute.evidence);

  if (evaluation.shouldAutoResolve) {
    const { clientAmount, freelancerAmount } = computeSplitAmounts(
      dispute.escrow.totalAmount,
      evaluation.clientSplit,
    );

    const updated = await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        resolvedAt: new Date(),
        clientAmount,
        freelancerAmount,
        resolvedBy: 'system',
        resolution: evaluation.resolution,
        resolutionType: ResolutionType.AUTO,
        autoResolved: true,
      },
    });

    await log({
      category: AuditCategory.DISPUTE,
      action: AuditAction.RESOLVE_DISPUTE,
      actor: 'system',
      resourceId: String(disputeId),
      metadata: { rule: evaluation.rule, confidence: evaluation.confidence, clientAmount, freelancerAmount },
    });

    return { resolved: true, resolutionType: ResolutionType.AUTO, dispute: updated };
  }

  // Escalate
  const updated = await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      resolutionType: ResolutionType.ESCALATED,
      resolution: evaluation.resolution,
    },
  });

  await log({
    category: AuditCategory.DISPUTE,
    action: 'ESCALATE_DISPUTE',
    actor: 'system',
    resourceId: String(disputeId),
    metadata: { reason: evaluation.resolution },
  });

  return { resolved: false, resolutionType: ResolutionType.ESCALATED, dispute: updated };
}

/**
 * Get resolution recommendation without committing any changes.
 * Useful for admin preview before manual resolution.
 *
 * @param {number} disputeId
 * @returns {Promise<object>} Evaluation result
 */
export async function getResolutionRecommendation(disputeId) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      escrow: { include: { milestones: true } },
      evidence: true,
    },
  });

  if (!dispute) throw new Error('Dispute not found');

  const evaluation = evaluateRules(dispute, dispute.evidence);
  const { clientAmount, freelancerAmount } = computeSplitAmounts(
    dispute.escrow.totalAmount,
    evaluation.clientSplit,
  );

  return { ...evaluation, clientAmount, freelancerAmount };
}

/**
 * Submit an appeal for a resolved dispute.
 *
 * @param {number} disputeId
 * @param {object} payload
 * @param {string} payload.appealedBy - Stellar address
 * @param {string} payload.reason
 * @returns {Promise<object>} Created appeal record
 */
export async function submitAppeal(disputeId, payload) {
  const { appealedBy, reason } = payload;
  if (!reason?.trim()) throw new Error('reason is required');

  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { appeals: { where: { appealedBy } } },
  });

  if (!dispute) throw new Error('Dispute not found');
  if (!dispute.resolvedAt) throw new Error('Can only appeal a resolved dispute');
  if (dispute.appeals.length > 0) throw new Error('You have already submitted an appeal for this dispute');

  const appeal = await prisma.disputeAppeal.create({
    data: { disputeId, appealedBy, reason: reason.trim(), status: 'pending' },
  });

  await log({
    category: AuditCategory.DISPUTE,
    action: 'SUBMIT_APPEAL',
    actor: appealedBy,
    resourceId: String(disputeId),
    metadata: { appealId: appeal.id },
  });

  return appeal;
}

/**
 * Review (approve or reject) an appeal. Admin only.
 *
 * @param {number} appealId
 * @param {object} payload
 * @param {string} payload.reviewedBy   - admin identifier
 * @param {'approved'|'rejected'} payload.status
 * @param {string} [payload.reviewNotes]
 * @returns {Promise<object>} Updated appeal record
 */
export async function reviewAppeal(appealId, payload) {
  const { reviewedBy, status, reviewNotes } = payload;
  if (!['approved', 'rejected'].includes(status)) throw new Error("status must be 'approved' or 'rejected'");

  const appeal = await prisma.disputeAppeal.findUnique({ where: { id: appealId } });
  if (!appeal) throw new Error('Appeal not found');
  if (appeal.status !== 'pending') throw new Error('Appeal has already been reviewed');

  const updated = await prisma.disputeAppeal.update({
    where: { id: appealId },
    data: { status, reviewedBy, reviewNotes: reviewNotes ?? null, resolvedAt: new Date() },
  });

  await log({
    category: AuditCategory.DISPUTE,
    action: 'REVIEW_APPEAL',
    actor: reviewedBy,
    resourceId: String(appeal.disputeId),
    metadata: { appealId, status, reviewNotes },
  });

  return updated;
}

export default {
  submitEvidence,
  runAutomatedResolution,
  getResolutionRecommendation,
  submitAppeal,
  reviewAppeal,
  evaluateRules,
  ResolutionType,
};
