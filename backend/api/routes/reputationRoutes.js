import express from 'express';
import reputationController from '../controllers/reputationController.js';

const router = express.Router();

/**
 * @route  GET /api/reputation/leaderboard
 * @desc   Top users by reputation score with the standard pagination envelope.
 * @query  page (default 1), limit (default 20, max 100)
 * @returns { data, page, limit, total, totalPages, hasNextPage, hasPreviousPage }
 */
router.get('/leaderboard', reputationController.getLeaderboard);

/**
 * @route  GET /api/reputation/:address
 * @desc   Get the full reputation record for an address.
 */
router.get('/:address', reputationController.getReputation);

export default router;
