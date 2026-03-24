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

export default router;
