import express from 'express';
import escrowController, {
  validateBroadcast,
  validateEscrowId,
  validatePagination,
} from '../controllers/escrowController.js';
import escrowController from '../controllers/escrowController.js';
import { cacheResponse, invalidateOn } from '../middleware/cache.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware);

router.get('/', validatePagination, escrowController.listEscrows);
router.post('/broadcast', validateBroadcast, escrowController.broadcastCreateEscrow);
router.get('/:id/milestones', validateEscrowId, validatePagination, escrowController.getMilestones);
router.get('/:id/milestones/:milestoneId', validateEscrowId, escrowController.getMilestone);
router.get('/:id', validateEscrowId, escrowController.getEscrow);
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
