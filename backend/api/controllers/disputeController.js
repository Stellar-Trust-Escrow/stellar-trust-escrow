/**
 * Dispute Controller
 *
 * Handles HTTP requests for the full dispute lifecycle:
 * open → evidence_collection → arbiter_review → ruled → appeal_window → final/appealed
 */

import * as disputeResolution from '../../services/disputeResolution.js';
import * as disputeEvidenceService from '../../services/disputeEvidenceService.js';
import prisma from '../../lib/prisma.js';

function handleError(res, err) {
  if (err.name === 'DomainError' && err.status) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

const disputeController = {
  async listDisputes(req, res) {
    try {
      const tenantId = req.user?.tenantId;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const result = await disputeResolution.listDisputes({ tenantId, page, limit });
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  },

  async getDispute(req, res) {
    try {
      const disputeId = parseInt(req.params.disputeId);
      const tenantId = req.user?.tenantId;
      const dispute = await disputeResolution.getDispute({ disputeId, tenantId });
      return res.json(dispute);
    } catch (err) {
      return handleError(res, err);
    }
  },

  async openDispute(req, res) {
    try {
      const { escrowId } = req.params;
      const { milestoneIndex, reason, evidenceHash } = req.body;
      const raisedByAddress = req.user?.stellarAddress || req.user?.address;
      const tenantId = req.user?.tenantId;

      const dispute = await disputeResolution.openDispute({
        escrowId,
        milestoneIndex,
        reason,
        evidenceHash,
        raisedByAddress,
        tenantId,
      });

      return res.status(201).json(dispute);
    } catch (err) {
      return handleError(res, err);
    }
  },

  async postEvidence(req, res) {
    try {
      const disputeId = parseInt(req.params.disputeId);
      const submitter = req.user?.stellarAddress || req.user?.address;
      const tenantId = req.user?.tenantId;
      const { evidenceHash, ipfsCid, description } = req.body;

      const evidence = await disputeEvidenceService.attachEvidence(
        disputeId,
        submitter,
        { evidenceHash, ipfsCid, description },
        tenantId,
      );

      return res.json(evidence);
    } catch (err) {
      return handleError(res, err);
    }
  },

  async listEvidence(req, res) {
    try {
      const disputeId = parseInt(req.params.disputeId);
      const packages = await disputeEvidenceService.getEvidencePackages(disputeId);
      return res.json(packages);
    } catch (err) {
      return handleError(res, err);
    }
  },

  async assignArbiter(req, res) {
    try {
      const disputeId = parseInt(req.params.disputeId);
      const { arbiterAddress } = req.body;
      const tenantId = req.user?.tenantId;

      const dispute = await disputeResolution.assignArbiter({
        disputeId,
        arbiterAddress,
        tenantId,
      });
      return res.json(dispute);
    } catch (err) {
      return handleError(res, err);
    }
  },

  async submitRuling(req, res) {
    try {
      const disputeId = parseInt(req.params.disputeId);
      const arbiterAddress = req.user?.stellarAddress || req.user?.address;
      const tenantId = req.user?.tenantId;
      const { clientPct, freelancerPct, reasoning } = req.body;

      const ruling = await disputeResolution.submitRuling({
        disputeId,
        arbiterAddress,
        clientPct,
        freelancerPct,
        reasoning,
        tenantId,
      });

      return res.json(ruling);
    } catch (err) {
      return handleError(res, err);
    }
  },

  async fileAppeal(req, res) {
    try {
      const disputeId = parseInt(req.params.disputeId);
      const appellantAddress = req.user?.stellarAddress || req.user?.address;
      const tenantId = req.user?.tenantId;
      const { groundsText, evidenceHash } = req.body;

      const appeal = await disputeResolution.fileAppeal({
        disputeId,
        groundsText,
        evidenceHash,
        appellantAddress,
        tenantId,
      });

      return res.json(appeal);
    } catch (err) {
      return handleError(res, err);
    }
  },

  async finalizeDispute(req, res) {
    try {
      const disputeId = parseInt(req.params.disputeId);
      const tenantId = req.user?.tenantId;

      const result = await disputeResolution.finalizeDispute({ disputeId, tenantId });
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  },

  async getRecommendation(_req, res) {
    return res.status(501).json({ error: 'Not implemented' });
  },

  async uploadEvidence(_req, res) {
    return res.status(501).json({ error: 'Not implemented' });
  },

  async patchAppeal(req, res) {
    try {
      const disputeId = parseInt(req.params.disputeId);
      const tenantId = req.user?.tenantId;

      const result = await disputeResolution.finalizeDispute({ disputeId, tenantId });
      return res.json(result);
    } catch (err) {
      return handleError(res, err);
    }
  },

  async autoResolve(_req, res) {
    return res.status(501).json({ error: 'Not implemented' });
  },

  async getResolutionHistory(req, res) {
    try {
      const tenantId = req.user?.tenantId;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      const [disputes, total] = await Promise.all([
        prisma.dispute.findMany({
          where: { tenantId, status: 'final' },
          skip,
          take: limit,
          orderBy: { resolvedAt: 'desc' },
          include: { evidence: true, appeals: true },
        }),
        prisma.dispute.count({ where: { tenantId, status: 'final' } }),
      ]);

      return res.json({ disputes, total, page, limit });
    } catch (err) {
      return handleError(res, err);
    }
  },
};

export default disputeController;
