import express from 'express';
import disputeController from '../controllers/disputeController.js';
import {
  validate,
  disputeListQueryRules,
  disputeEscrowIdParamRules,
} from '../middleware/validation.js';

const router = express.Router();

/**
 * @route  GET /api/disputes
 * @desc   List disputes with the standard pagination envelope.
 * @query  page (default 1), limit (default 20, max 100) — validated when present
 * @returns { data, page, limit, total, totalPages, hasNextPage, hasPreviousPage }
 */
router.get('/', validate(disputeListQueryRules), disputeController.listDisputes);

/**
 * @route  GET /api/disputes/:escrowId
 * @desc   Get dispute details for a specific escrow.
 * @param  escrowId — decimal string, 1 … 2^64−1 (see validation middleware)
 */
router.get('/:escrowId', validate(disputeEscrowIdParamRules), disputeController.getDispute);

export default router;
