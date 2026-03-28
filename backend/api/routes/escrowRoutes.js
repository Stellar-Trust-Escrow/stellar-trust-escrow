import express from 'express';
import escrowController, {
  validateBroadcast,
  validateEscrowId,
  validatePagination,
} from '../controllers/escrowController.js';
import escrowController from '../controllers/escrowController.js';
import { cacheResponse, invalidateOn, TTL } from '../middleware/cache.js';
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
 * @desc   List escrows with the standard pagination envelope.
 */
router.get(
  '/',
  cacheResponse({ ttl: TTL.LIST, tags: ['escrows'] }),
  escrowController.listEscrows,
);

/**
 * @route  POST /api/escrows/broadcast
 * @desc   Broadcast a pre-signed create_escrow transaction.
 * Invalidates the escrow list so the new escrow appears immediately.
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
    ttl: TTL.DETAIL,
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
    ttl: TTL.DETAIL,
    tags: (req) => [`escrow:${req.params.id}`, `milestone:${req.params.id}:${req.params.milestoneId}`],
  }),
  escrowController.getMilestone,
);

/**
 * @route  GET /api/escrows/:id
 */
router.get(
  '/:id',
  cacheResponse({
    ttl: TTL.DETAIL,
    tags: (req) => ['escrows', `escrow:${req.params.id}`],
  }),
  escrowController.getEscrow,
);

export default router;
