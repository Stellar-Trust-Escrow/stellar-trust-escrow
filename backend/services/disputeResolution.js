/**
 * Dispute Resolution Service
 * 
 * Implements automated dispute resolution based on predefined rules and evidence submission.
 * Handles evidence storage, rule evaluation, resolution recommendations, escalation, and appeals.
 */

import prisma from '../lib/prisma.js';

/**
 * Resolution Rules Configuration
 * 
 * Defines the rules for automated dispute resolution.
 * Each rule has a name, condition, weight, and action.
 */
const RESOLUTION_RULES = {
  // Rule: Freelancer has completed more than 80% of milestones
  MILESTONE_COMPLETION: {
    name: 'MilestoneCompletion',
    description: 'Freelancer has completed most milestones',
    weight: 0.3,
    condition: (dispute, escrow, evidence) => {
      if (!escrow.milestones || escrow.milestones.length === 0) return null;
      
      const completed = escrow.milestones.filter(m => m.status === 'Approved').length;
      const total = escrow.milestones.length;
      const ratio = completed / total;
      
      if (ratio >= 0.8) {
        return {
          passed: true,
          recommendation: 'favor_freelancer',
          reason: `Freelancer has completed ${completed}/${total} milestones (${Math.round(ratio * 100)}%)`
        };
      } else if (ratio <= 0.2) {
        return {
          passed: true,
          recommendation: 'favor_client',
          reason: `Freelancer has completed only ${completed}/${total} milestones (${Math.round(ratio * 100)}%)`
        };
      }
      return null;
    }
  },

  // Rule: Evidence submission balance
  EVIDENCE_BALANCE: {
    name: 'EvidenceBalance',
    description: 'Check balance of evidence from both parties',
    weight: 0.25,
    condition: (dispute, escrow, evidence) => {
      const clientEvidence = evidence.filter(e => e.submittedBy === escrow.clientAddress);
      const freelancerEvidence = evidence.filter(e => e.submittedBy === escrow.freelancerAddress);
      
      const balance = Math.abs(clientEvidence.length - freelancerEvidence.length);
      
      // If one side has significantly more evidence (>2), favor that side
      if (balance > 2) {
        const favoredSide = clientEvidence.length > freelancerEvidence.length ? 'client' : 'freelancer';
        return {
          passed: true,
          recommendation: `favor_${favoredSide}`,
          reason: `${favoredSide.charAt(0).toUpperCase() + favoredSide.slice(1)} submitted ${balance} more evidence items`
        };
      }
      return null;
    }
  },

  // Rule: Work submission timeline
  TIMELINE_ADHERENCE: {
    name: 'TimelineAdherence',
    description: 'Check if work was submitted on time',
    weight: 0.2,
    condition: (dispute, escrow, evidence) => {
      // Check if there are any evidence submissions indicating delays
      const timelineEvidence = evidence.filter(e => 
        e.evidenceType === 'timeline' || e.evidenceType === 'document'
      );
      
      // Look for evidence about deadline issues
      const delayEvidence = timelineEvidence.filter(e => {
        const desc = e.description.toLowerCase();
        return desc.includes('delay') || desc.includes('late') || desc.includes('deadline missed');
      });
      
      if (delayEvidence.length > 0) {
        return {
          passed: true,
          recommendation: 'favor_client',
          reason: 'Evidence suggests timeline issues/delays from freelancer'
        };
      }
      return null;
    }
  },

  // Rule: Payment status
  PAYMENT_STATUS: {
    name: 'PaymentStatus',
    description: 'Check payment status and amounts',
    weight: 0.15,
    condition: (dispute, escrow, evidence) => {
      // If client hasn't made full payment, favor client
      const totalAmount = BigInt(escrow.totalAmount || '0');
      const remainingBalance = BigInt(escrow.remainingBalance || '0');
      const paidAmount = totalAmount - remainingBalance;
      
      const paymentRatio = totalAmount > 0n ? Number(paidAmount * 100n / totalAmount) : 0;
      
      if (paymentRatio < 50) {
        return {
          passed: true,
          recommendation: 'favor_client',
          reason: `Client has only paid ${paymentRatio}% of the total amount`
        };
      }
      return null;
    }
  },

  // Rule: Dispute reason analysis
  DISPUTE_REASON: {
    name: 'DisputeReason',
    description: 'Analyze the reason for dispute',
    weight: 0.1,
    condition: (dispute, escrow, evidence) => {
      // Check evidence descriptions for common patterns
      const allDescriptions = evidence.map(e => e.description.toLowerCase()).join(' ');
      
      // Quality issues favor client
      if (allDescriptions.includes('quality') && allDescriptions.includes('poor')) {
        return {
          passed: true,
          recommendation: 'favor_client',
          reason: 'Evidence indicates quality issues with deliverables'
        };
      }
      
      // Payment issues favor freelancer
      if ((allDescriptions.includes('payment') || allDescriptions.includes('unpaid')) && 
          !allDescriptions.includes('refund')) {
        return {
          passed: true,
          recommendation: 'favor_freelancer',
          reason: 'Evidence indicates payment issues'
        };
      }
      
      return null;
    }
  }
};

/**
 * Escalation Criteria
 * 
 * Defines conditions that require manual escalation.
 */
const ESCALATION_CRITERIA = {
  // Amount threshold - disputes over 10000 XLM require manual review
  AMOUNT_THRESHOLD: {
    threshold: BigInt('10000000000'), // 10,000 XLM in stroops
    check: (escrow) => BigInt(escrow.totalAmount || '0') > BigInt('10000000000')
  },

  // Complex evidence - more than 10 evidence items
  COMPLEX_EVIDENCE: {
    threshold: 10,
    check: (dispute, escrow, evidence) => evidence.length > 10
  },

  // Disagreement on key facts
  FACTUAL_DISAGREEMENT: {
    check: (dispute, escrow, evidence) => {
      // If both parties have submitted contradictory evidence
      const clientEvidence = evidence.filter(e => e.submittedBy === escrow.clientAddress);
      const freelancerEvidence = evidence.filter(e => e.submittedBy === escrow.freelancerAddress);
      
      // Check for contradictory claims in evidence
      const clientDescriptions = clientEvidence.map(e => e.description.toLowerCase());
      const freelancerDescriptions = freelancerEvidence.map(e => e.description.toLowerCase());
      
      // Simple keyword matching for contradiction detection
      const hasContradiction = clientDescriptions.some(cd => 
        freelancerDescriptions.some(fd => 
          (cd.includes('complete') && fd.includes('incomplete')) ||
          (cd.includes('paid') && fd.includes('unpaid')) ||
          (cd.includes('approve') && fd.includes('reject'))
        )
      );
      
      return hasContradiction;
    }
  },

  // Previous appeals
  PREVIOUS_APPEALS: {
    check: async (disputeId) => {
      const appeals = await prisma.disputeAppeal.findMany({
        where: { disputeId }
      });
      return appeals.length > 0;
    }
  }
};

/**
 * Submit evidence for a dispute
 * 
 * @param {number} disputeId - The dispute ID
 * @param {object} evidenceData - Evidence data (submittedBy, evidenceType, description, evidenceUrl, metadata)
 * @returns {Promise<object>} - The created evidence record
 */
export async function submitEvidence(disputeId, evidenceData) {
  const { submittedBy, evidenceType, description, evidenceUrl, metadata } = evidenceData;

  // Verify dispute exists
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { escrow: true }
  });

  if (!dispute) {
    throw new Error('Dispute not found');
  }

  // Verify the submitter is a party to the dispute
  if (submittedBy !== dispute.escrow.clientAddress && 
      submittedBy !== dispute.escrow.freelancerAddress &&
      submittedBy !== dispute.escrow.arbiterAddress) {
    throw new Error('Only parties to the dispute can submit evidence');
  }

  // Create evidence record
  const evidence = await prisma.disputeEvidence.create({
    data: {
      disputeId,
      submittedBy,
      evidenceType,
      description,
      evidenceUrl,
      metadata,
      submittedAt: new Date()
    }
  });

  return evidence;
}

/**
 * Get all evidence for a dispute
 * 
 * @param {number} disputeId - The dispute ID
 * @returns {Promise<object[]>} - Array of evidence records
 */
export async function getEvidence(disputeId) {
  return prisma.disputeEvidence.findMany({
    where: { disputeId },
    orderBy: { submittedAt: 'desc' }
  });
}

/**
 * Evaluate resolution rules for a dispute
 * 
 * @param {number} disputeId - The dispute ID
 * @returns {Promise<object>} - Evaluation results with recommendation
 */
export async function evaluateResolutionRules(disputeId) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      escrow: {
        include: {
          milestones: true
        }
      },
      evidence: true
    }
  });

  if (!dispute) {
    throw new Error('Dispute not found');
  }

  const results = {
    rulesEvaluated: [],
    recommendation: null,
    confidence: 0,
    shouldEscalate: false,
    escalationReason: null
  };

  // Evaluate each rule
  for (const [key, rule] of Object.entries(RESOLUTION_RULES)) {
    try {
      const ruleResult = rule.condition(dispute, dispute.escrow, dispute.evidence);
      results.rulesEvaluated.push({
        rule: key,
        name: rule.name,
        description: rule.description,
        weight: rule.weight,
        result: ruleResult
      });

      // Add to confidence if rule passed
      if (ruleResult?.passed) {
        results.confidence += rule.weight;
      }
    } catch (error) {
      results.rulesEvaluated.push({
        rule: key,
        name: rule.name,
        error: error.message
      });
    }
  }

  // Determine recommendation based on results
  const favorFreelancer = results.rulesEvaluated.filter(
    r => r.result?.recommendation === 'favor_freelancer'
  ).length;
  
  const favorClient = results.rulesEvaluated.filter(
    r => r.result?.recommendation === 'favor_client'
  ).length;

  if (favorFreelancer > favorClient) {
    results.recommendation = 'favor_freelancer';
  } else if (favorClient > favorFreelancer) {
    results.recommendation = 'favor_client';
  } else {
    results.recommendation = 'escalate';
  }

  // Check escalation criteria
  const shouldEscalate = await checkEscalationCriteria(dispute, dispute.escrow, dispute.evidence);
  results.shouldEscalate = shouldEscalate.escalate;
  results.escalationReason = shouldEscalate.reason;

  return results;
}

/**
 * Check if dispute should be escalated
 * 
 * @param {object} dispute - The dispute record
 * @param {object} escrow - The escrow record
 * @param {object[]} evidence - Evidence array
 * @returns {Promise<object>} - Escalation check results
 */
async function checkEscalationCriteria(dispute, escrow, evidence) {
  // Check amount threshold
  if (ESCALATION_CRITERIA.AMOUNT_THRESHOLD.check(escrow)) {
    return {
      escalate: true,
      reason: 'Dispute amount exceeds automatic resolution threshold'
    };
  }

  // Check complex evidence
  if (ESCALATION_CRITERIA.COMPLEX_EVIDENCE.check(dispute, escrow, evidence)) {
    return {
      escalate: true,
      reason: 'Too many evidence items for automatic resolution'
    };
  }

  // Check factual disagreement
  if (ESCALATION_CRITERIA.FACTUAL_DISAGREEMENT.check(dispute, escrow, evidence)) {
    return {
      escalate: true,
      reason: 'Contradictory evidence from parties requires manual review'
    };
  }

  // Check previous appeals
  if (await ESCALATION_CRITERIA.PREVIOUS_APPEALS.check(dispute.id)) {
    return {
      escalate: true,
      reason: 'Previous appeals require senior review'
    };
  }

  // Check confidence level
  const evaluation = await evaluateResolutionRules(dispute.id);
  if (evaluation.confidence < 0.5) {
    return {
      escalate: true,
      reason: 'Low confidence in automatic resolution'
    };
  }

  return { escalate: false, reason: null };
}

/**
 * Auto-resolve a dispute (if criteria are met)
 * 
 * @param {number} disputeId - The dispute ID
 * @returns {Promise<object>} - Resolution result
 */
export async function autoResolveDispute(disputeId) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { escrow: true }
  });

  if (!dispute) {
    throw new Error('Dispute not found');
  }

  if (dispute.status !== 'Pending' && dispute.status !== 'UnderReview') {
    throw new Error('Dispute cannot be resolved in current status');
  }

  // Evaluate rules
  const evaluation = await evaluateResolutionRules(disputeId);

  // Check if we should auto-resolve
  if (evaluation.shouldEscalate) {
    // Escalate instead of auto-resolve
    await prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'Escalated',
        escalationReason: evaluation.escalationReason
      }
    });

    // Create resolution record
    await prisma.disputeResolution.create({
      data: {
        disputeId,
        resolutionType: 'auto',
        outcome: 'escalated',
        recommendation: evaluation.recommendation,
        rulesEvaluated: evaluation.rulesEvaluated,
        reason: evaluation.escalationReason,
        resolvedBy: 'system'
      }
    });

    return {
      resolved: false,
      escalated: true,
      reason: evaluation.escalationReason,
      evaluation
    };
  }

  // Calculate resolution amounts based on recommendation
  const totalAmount = BigInt(dispute.escrow.totalAmount || '0');
  const remainingBalance = BigInt(dispute.escrow.remainingBalance || '0');

  let clientAmount, freelancerAmount;

  if (evaluation.recommendation === 'favor_freelancer') {
    // Freelancer gets remaining balance
    clientAmount = '0';
    freelancerAmount = remainingBalance.toString();
  } else if (evaluation.recommendation === 'favor_client') {
    // Client gets remaining balance
    clientAmount = remainingBalance.toString();
    freelancerAmount = '0';
  } else {
    // Split evenly
    clientAmount = (remainingBalance / 2n).toString();
    freelancerAmount = (remainingBalance / 2n).toString();
  }

  // Update dispute status
  await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status: 'AutoResolved',
      resolvedAt: new Date(),
      clientAmount,
      freelancerAmount,
      resolvedBy: 'system',
      resolutionType: 'auto',
      resolution: `Auto-resolved: ${evaluation.recommendation}`
    }
  });

  // Create resolution history record
  await prisma.disputeResolution.create({
    data: {
      disputeId,
      resolutionType: 'auto',
      outcome: evaluation.recommendation,
      recommendation: evaluation.recommendation,
      rulesEvaluated: evaluation.rulesEvaluated,
      reason: `Automatic resolution based on ${evaluation.rulesEvaluated.filter(r => r.result?.passed).length} passing rules`,
      resolvedBy: 'system',
      createdAt: new Date()
    }
  });

  return {
    resolved: true,
    escalated: false,
    clientAmount,
    freelancerAmount,
    recommendation: evaluation.recommendation,
    confidence: evaluation.confidence
  };
}

/**
 * Manually resolve a dispute (admin/arbiter)
 * 
 * @param {number} disputeId - The dispute ID
 * @param {object} resolutionData - Resolution data (resolvedBy, clientAmount, freelancerAmount, resolution)
 * @returns {Promise<object>} - Resolution result
 */
export async function resolveDisputeManually(disputeId, resolutionData) {
  const { resolvedBy, clientAmount, freelancerAmount, resolution } = resolutionData;

  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { escrow: true }
  });

  if (!dispute) {
    throw new Error('Dispute not found');
  }

  // Update dispute
  await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status: 'Resolved',
      resolvedAt: new Date(),
      clientAmount: clientAmount || '0',
      freelancerAmount: freelancerAmount || '0',
      resolvedBy,
      resolutionType: 'manual',
      resolution
    }
  });

  // Create resolution history record
  await prisma.disputeResolution.create({
    data: {
      disputeId,
      resolutionType: 'manual',
      outcome: resolution,
      reason: resolution,
      resolvedBy,
      createdAt: new Date()
    }
  });

  return {
    resolved: true,
    clientAmount,
    freelancerAmount,
    resolution
  };
}

/**
 * File an appeal for a resolved dispute
 * 
 * @param {number} disputeId - The dispute ID
 * @param {object} appealData - Appeal data (filedBy, reason, context)
 * @returns {Promise<object>} - Created appeal record
 */
export async function fileAppeal(disputeId, appealData) {
  const { filedBy, reason, context } = appealData;

  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: { escrow: true }
  });

  if (!dispute) {
    throw new Error('Dispute not found');
  }

  // Verify the filer is a party to the dispute
  if (filedBy !== dispute.escrow.clientAddress && 
      filedBy !== dispute.escrow.freelancerAddress) {
    throw new Error('Only parties to the dispute can file an appeal');
  }

  // Check if dispute is resolved
  if (dispute.status !== 'Resolved' && dispute.status !== 'AutoResolved') {
    throw new Error('Can only appeal resolved disputes');
  }

  // Check if already appealed
  const existingAppeal = await prisma.disputeAppeal.findUnique({
    where: { disputeId }
  });

  if (existingAppeal) {
    throw new Error('Dispute has already been appealed');
  }

  // Create appeal
  const appeal = await prisma.disputeAppeal.create({
    data: {
      disputeId,
      filedBy,
      reason,
      context,
      status: 'pending',
      createdAt: new Date()
    }
  });

  // Update dispute status
  await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status: 'Appealed',
      appealed: true
    }
  });

  return appeal;
}

/**
 * Review an appeal (admin)
 * 
 * @param {number} disputeId - The dispute ID
 * @param {object} reviewData - Review data (reviewedBy, appealResult, status)
 * @returns {Promise<object>} - Updated appeal record
 */
export async function reviewAppeal(disputeId, reviewData) {
  const { reviewedBy, appealResult, status } = reviewData;

  const appeal = await prisma.disputeAppeal.findUnique({
    where: { disputeId }
  });

  if (!appeal) {
    throw new Error('Appeal not found');
  }

  if (appeal.status !== 'pending') {
    throw new Error('Appeal has already been reviewed');
  }

  // Update appeal
  const updatedAppeal = await prisma.disputeAppeal.update({
    where: { disputeId },
    data: {
      appealResult,
      status,
      reviewedBy,
      reviewedAt: new Date()
    }
  });

  // If appeal is rejected, maintain original resolution
  // If appeal is approved, we would need to implement re-resolution logic
  if (status === 'rejected') {
    // Keep existing resolution but mark appeal as reviewed
    await prisma.dispute.update({
      where: { id: disputeId },
      data: { status: 'Resolved' } // Return to resolved status
    });
  }

  return updatedAppeal;
}

/**
 * Get resolution history for a dispute
 * 
 * @param {number} disputeId - The dispute ID
 * @returns {Promise<object[]>} - Array of resolution records
 */
export async function getResolutionHistory(disputeId) {
  return prisma.disputeResolution.findMany({
    where: { disputeId },
    orderBy: { createdAt: 'desc' }
  });
}

/**
 * Get appeal details
 * 
 * @param {number} disputeId - The dispute ID
 * @returns {Promise<object|null>} - Appeal record or null
 */
export async function getAppeal(disputeId) {
  return prisma.disputeAppeal.findUnique({
    where: { disputeId }
  });
}

export default {
  submitEvidence,
  getEvidence,
  evaluateResolutionRules,
  autoResolveDispute,
  resolveDisputeManually,
  fileAppeal,
  reviewAppeal,
  getResolutionHistory,
  getAppeal
};