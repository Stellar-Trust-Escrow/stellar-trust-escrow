import express from 'express';
import disputeController from '../controllers/disputeController.js';
import { cacheResponse, invalidateOn, TTL } from '../middleware/cache.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware);

// ── List / Get ────────────────────────────────────────────────────────────────

router.get(
  '/',
  cacheResponse({ ttl: TTL.LIST, tags: ['disputes'] }),
  disputeController.listDisputes,
);

router.get(
  '/history',
  cacheResponse({ ttl: TTL.LIST, tags: ['disputes', 'disputes:history'] }),
  disputeController.getResolutionHistory,
);

router.get(
  '/:escrowId',
  cacheResponse({
    ttl: TTL.DETAIL,
    tags: (req) => ['disputes', `dispute:${req.params.escrowId}`],
  }),
  disputeController.getDispute,
);

// ── Evidence ──────────────────────────────────────────────────────────────────

router.post(
  '/:id/evidence',
  invalidateOn({ tags: (req) => [`dispute:${req.params.id}`, 'disputes'] }),
  disputeController.postEvidence,
);

router.get(
  '/:id/evidence',
  cacheResponse({
    ttl: TTL.DETAIL,
    tags: (req) => [`dispute:${req.params.id}`],
  }),
  disputeController.listEvidence,
);

// ── Automated Resolution ──────────────────────────────────────────────────────

router.post(
  '/:id/resolve/auto',
  invalidateOn({
    tags: (req) => [
      `dispute:${req.params.id}`,
      `escrow:${req.params.id}`,
      'disputes',
      'escrows',
    ],
  }),
  disputeController.autoResolve,
);

router.get(
  '/:id/resolve/recommendation',
  cacheResponse({
    ttl: TTL.DETAIL,
    tags: (req) => [`dispute:${req.params.id}`],
  }),
  disputeController.getRecommendation,
);

// ── Appeals ───────────────────────────────────────────────────────────────────

router.post(
  '/:id/appeals',
  invalidateOn({ tags: (req) => [`dispute:${req.params.id}`, 'disputes'] }),
  disputeController.postAppeal,
);

router.patch(
  '/appeals/:appealId',
  invalidateOn({ tags: ['disputes'] }),
  disputeController.patchAppeal,
);

export default router;
