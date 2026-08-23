import express from 'express';
import streamController from '../controllers/streamController.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware);

/**
 * @route  GET /api/v1/streams
 * @desc   List streams for authenticated user (sender or recipient)
 */
router.get('/', streamController.listStreams);

/**
 * @route  GET /api/v1/streams/:streamId
 * @desc   Get single stream details
 */
router.get('/:streamId', streamController.getStream);

/**
 * @route  GET /api/v1/streams/:streamId/accrued
 * @desc   Query contract for current accrued amount (live, not cached)
 */
router.get('/:streamId/accrued', streamController.getAccrued);

/**
 * @route  POST /api/v1/streams/:streamId/claim
 * @desc   Build unsigned claim XDR for client to sign and submit
 */
router.post('/:streamId/claim', streamController.buildClaimXdr);

export default router;
