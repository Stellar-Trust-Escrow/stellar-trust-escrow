import express from 'express';
import reputationController from '../controllers/reputationController.js';
import { cacheResponse, TTL } from '../middleware/cache.js';

const router = express.Router();

/**
 * @route  GET /api/reputation/leaderboard
 */
router.get(
  '/leaderboard',
  cacheResponse({ ttl: TTL.LEADERBOARD, tags: ['reputation:leaderboard'] }),
  reputationController.getLeaderboard,
);

/**
 * @route  GET /api/reputation/:address
 */
router.get(
  '/:address',
  cacheResponse({
    ttl: TTL.REPUTATION,
    tags: (req) => ['reputation', `reputation:${req.params.address}`],
  }),
  reputationController.getReputation,
);

export default router;
