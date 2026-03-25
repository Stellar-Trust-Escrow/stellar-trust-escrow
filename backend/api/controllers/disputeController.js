import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import disputeResolutionService from '../../services/disputeResolution.js';

const listDisputes = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { resolved } = req.query;

    const where = {};
    if (resolved === 'true') where.resolvedAt = { not: null };
    else if (resolved === 'false') where.resolvedAt = null;

    const cacheKey = `disputes:list:${resolved ?? 'all'}:${page}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [data, total] = await prisma.$transaction([
      prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        orderBy: { raisedAt: 'desc' },
        select: {
          id: true,
          escrowId: true,
          raisedByAddress: true,
          raisedAt: true,
          status: true,
          resolvedAt: true,
          resolution: true,
          escrow: {
            select: {
              clientAddress: true,
              freelancerAddress: true,
              arbiterAddress: true,
              totalAmount: true,
              status: true,
            },
          },
        },
      }),
      prisma.dispute.count({ where }),
    ]);

    const result = buildPaginatedResponse(data, { total, page, limit });
    cache.set(cacheKey, result, 30);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getDispute = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.escrowId);
    const cacheKey = `disputes:${escrowId}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const dispute = await prisma.dispute.findUnique({
      where: { escrowId },
      select: {
        id: true,
        escrowId: true,
        raisedByAddress: true,
        raisedAt: true,
        resolvedAt: true,
        clientAmount: true,
        freelancerAmount: true,
        resolvedBy: true,
        resolution: true,
        escrow: {
          select: {
            clientAddress: true,
            freelancerAddress: true,
            arbiterAddress: true,
            totalAmount: true,
            status: true,
          },
        },
      },
    });

    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    cache.set(cacheKey, dispute, 60);
    res.json(dispute);
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    res.status(500).json({ error: err.message });
  }
};

/**
 * Submit evidence for a dispute
 * POST /api/disputes/:disputeId/evidence
 */
const submitEvidence = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.disputeId);
    const { submittedBy, evidenceType, description, evidenceUrl, metadata } = req.body;

    if (!submittedBy || !evidenceType || !description) {
      return res.status(400).json({ 
        error: 'Missing required fields: submittedBy, evidenceType, description' 
      });
    }

    const evidence = await disputeResolutionService.submitEvidence(disputeId, {
      submittedBy,
      evidenceType,
      description,
      evidenceUrl,
      metadata
    });

    // Invalidate cache
    cache.del(`disputes:${disputeId}`);

    res.status(201).json(evidence);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * Get all evidence for a dispute
 * GET /api/disputes/:disputeId/evidence
 */
const getEvidence = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.disputeId);
    const evidence = await disputeResolutionService.getEvidence(disputeId);
    res.json(evidence);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Evaluate resolution rules for a dispute
 * GET /api/disputes/:disputeId/evaluate
 */
const evaluateRules = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.disputeId);
    const evaluation = await disputeResolutionService.evaluateResolutionRules(disputeId);
    res.json(evaluation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Auto-resolve a dispute
 * POST /api/disputes/:disputeId/auto-resolve
 */
const autoResolve = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.disputeId);
    const result = await disputeResolutionService.autoResolveDispute(disputeId);

    // Invalidate cache
    cache.del(`disputes:${disputeId}`);
    cache.del('disputes:list:*');

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * Manually resolve a dispute
 * POST /api/disputes/:disputeId/resolve
 */
const resolveDispute = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.disputeId);
    const { resolvedBy, clientAmount, freelancerAmount, resolution } = req.body;

    if (!resolvedBy || !resolution) {
      return res.status(400).json({ 
        error: 'Missing required fields: resolvedBy, resolution' 
      });
    }

    const result = await disputeResolutionService.resolveDisputeManually(disputeId, {
      resolvedBy,
      clientAmount,
      freelancerAmount,
      resolution
    });

    // Invalidate cache
    cache.del(`disputes:${disputeId}`);
    cache.del('disputes:list:*');

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * File an appeal
 * POST /api/disputes/:disputeId/appeal
 */
const fileAppeal = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.disputeId);
    const { filedBy, reason, context } = req.body;

    if (!filedBy || !reason) {
      return res.status(400).json({ 
        error: 'Missing required fields: filedBy, reason' 
      });
    }

    const appeal = await disputeResolutionService.fileAppeal(disputeId, {
      filedBy,
      reason,
      context
    });

    // Invalidate cache
    cache.del(`disputes:${disputeId}`);

    res.status(201).json(appeal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * Review an appeal
 * POST /api/disputes/:disputeId/appeal/review
 */
const reviewAppeal = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.disputeId);
    const { reviewedBy, appealResult, status } = req.body;

    if (!reviewedBy || !appealResult || !status) {
      return res.status(400).json({ 
        error: 'Missing required fields: reviewedBy, appealResult, status' 
      });
    }

    const appeal = await disputeResolutionService.reviewAppeal(disputeId, {
      reviewedBy,
      appealResult,
      status
    });

    // Invalidate cache
    cache.del(`disputes:${disputeId}`);

    res.json(appeal);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

/**
 * Get resolution history
 * GET /api/disputes/:disputeId/resolution-history
 */
const getResolutionHistory = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.disputeId);
    const history = await disputeResolutionService.getResolutionHistory(disputeId);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get appeal details
 * GET /api/disputes/:disputeId/appeal
 */
const getAppeal = async (req, res) => {
  try {
    const disputeId = parseInt(req.params.disputeId);
    const appeal = await disputeResolutionService.getAppeal(disputeId);
    
    if (!appeal) {
      return res.status(404).json({ error: 'No appeal found for this dispute' });
    }
    
    res.json(appeal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { 
  listDisputes, 
  getDispute,
  submitEvidence,
  getEvidence,
  evaluateRules,
  autoResolve,
  resolveDispute,
  fileAppeal,
  reviewAppeal,
  getResolutionHistory,
  getAppeal
};
