import * as approvalService from '../../services/approvalWorkflowService.js';

const approvalController = {
  createRequest: async (req, res) => {
    try {
      const { escrowId, milestoneIndex, requiredApprovers, threshold, deadlineAt } = req.body;
      const initiatedBy = req.user?.stellarAddress || req.user?.address;
      const result = await approvalService.createApprovalRequest({
        escrowId,
        milestoneIndex,
        requiredApprovers,
        threshold,
        deadlineAt: new Date(deadlineAt),
        initiatedBy,
      });
      res.status(201).json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  },

  getRequest: async (req, res) => {
    try {
      const result = await approvalService.getRequest(req.params.requestId);
      if (!result) return res.status(404).json({ error: 'Not found' });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  },

  approve: async (req, res) => {
    try {
      const approverAddress = req.user?.stellarAddress || req.user?.address;
      const { signatureProof } = req.body;
      const result = await approvalService.recordApproval(
        req.params.requestId,
        approverAddress,
        signatureProof,
      );
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  },

  reject: async (req, res) => {
    try {
      const rejectorAddress = req.user?.stellarAddress || req.user?.address;
      const { reason } = req.body;
      const result = await approvalService.recordRejection(
        req.params.requestId,
        rejectorAddress,
        reason,
      );
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  },

  listRequests: async (req, res) => {
    try {
      const { escrowId, status, page, limit } = req.query;
      const result = await approvalService.listRequests({
        escrowId,
        status,
        page: parseInt(page || '1'),
        limit: parseInt(limit || '20'),
      });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  },
};

export default approvalController;
