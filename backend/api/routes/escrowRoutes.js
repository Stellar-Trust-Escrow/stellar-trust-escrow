import express from 'express';
import escrowController from '../controllers/escrowController.js';
import { cacheResponse, invalidateOn } from '../middleware/cache.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware);

// TTLs per spec: 5 min for lists, 15 min for individual escrows
const LIST_TTL   = parseInt(process.env.CACHE_TTL_ESCROW_LIST   || '300',  10);
const DETAIL_TTL = parseInt(process.env.CACHE_TTL_ESCROW_DETAIL || '900',  10);

/**
 * @route  GET /api/escrows
 * Cache key pattern: escrow:list:{page} (via tag-based invalidation)
 */
router.get(
  '/',
  cacheResponse({
    ttl: LIST_TTL,
    tags: (req) => ['escrows', `escrow:list:${req.query.page || '1'}`],
  }),
  escrowController.listEscrows,
);

/**
 * @route  POST /api/escrows/broadcast
 * Invalidates all list pages on new escrow creation.
 */
router.post(
  '/broadcast',
  invalidateOn({ tags: ['escrows'] }),
  escrowController.broadcastCreateEscrow,
);

/**
 * @route  GET /api/escrows/:id/milestones
 */
router.get(
  '/:id/milestones',
  cacheResponse({
    ttl: DETAIL_TTL,
    tags: (req) => [`escrow:${req.params.id}`, 'milestones'],
  }),
  escrowController.getMilestones,
);

/**
 * @route  GET /api/escrows/:id/milestones/:milestoneId
 */
router.get(
  '/:id/milestones/:milestoneId',
  cacheResponse({
    ttl: DETAIL_TTL,
    tags: (req) => [
      `escrow:${req.params.id}`,
      `milestone:${req.params.id}:${req.params.milestoneId}`,
    ],
  }),
  escrowController.getMilestone,
);

/**
 * @route  GET /api/escrows/:id
 * Cache key pattern: escrow:{id}
 */
router.get(
  '/:id',
  cacheResponse({
    ttl: DETAIL_TTL,
    tags: (req) => ['escrows', `escrow:${req.params.id}`],
  }),
  escrowController.getEscrow,
);

export default router;
