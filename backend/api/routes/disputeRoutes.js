import express from 'express';
import disputeController from '../controllers/disputeController.js';

const router = express.Router();

/**
 * @route  GET /api/disputes
 * @desc   List disputes with the standard pagination envelope.
 * @query  page (default 1), limit (default 20, max 100)
 * @returns { data, page, limit, total, totalPages, hasNextPage, hasPreviousPage }
 */
router.get('/', disputeController.listDisputes);

/**
 * @route  GET /api/disputes/:escrowId
 * @desc   Get dispute details for a specific escrow.
 */
router.get('/:escrowId', disputeController.getDispute);

/**
 * @route  POST /api/disputes/:disputeId/evidence
 * @desc   Submit evidence for a dispute.
 * @body   { submittedBy, evidenceType, description, evidenceUrl, metadata }
 */
router.post('/:disputeId/evidence', disputeController.submitEvidence);

/**
 * @route  GET /api/disputes/:disputeId/evidence
 * @desc   Get all evidence for a dispute.
 */
router.get('/:disputeId/evidence', disputeController.getEvidence);

/**
 * @route  GET /api/disputes/:disputeId/evaluate
 * @desc   Evaluate resolution rules for a dispute.
 */
router.get('/:disputeId/evaluate', disputeController.evaluateRules);

/**
 * @route  POST /api/disputes/:disputeId/auto-resolve
 * @desc   Auto-resolve a dispute (system).
 */
router.post('/:disputeId/auto-resolve', disputeController.autoResolve);

/**
 * @route  POST /api/disputes/:disputeId/resolve
 * @desc   Manually resolve a dispute (admin/arbiter).
 * @body   { resolvedBy, clientAmount, freelancerAmount, resolution }
 */
router.post('/:disputeId/resolve', disputeController.resolveDispute);

/**
 * @route  POST /api/disputes/:disputeId/appeal
 * @desc   File an appeal for a resolved dispute.
 * @body   { filedBy, reason, context }
 */
router.post('/:disputeId/appeal', disputeController.fileAppeal);

/**
 * @route  GET /api/disputes/:disputeId/appeal
 * @desc   Get appeal details for a dispute.
 */
router.get('/:disputeId/appeal', disputeController.getAppeal);

/**
 * @route  POST /api/disputes/:disputeId/appeal/review
 * @desc   Review an appeal (admin).
 * @body   { reviewedBy, appealResult, status }
 */
router.post('/:disputeId/appeal/review', disputeController.reviewAppeal);

/**
 * @route  GET /api/disputes/:disputeId/resolution-history
 * @desc   Get resolution history for a dispute.
 */
router.get('/:disputeId/resolution-history', disputeController.getResolutionHistory);

export default router;
