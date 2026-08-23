import express from 'express';
import disputeController from '../controllers/disputeController.js';
import { cacheResponse, invalidateOn, TTL } from '../middleware/cache.js';
import authMiddleware from '../middleware/auth.js';
import { raiseDispute, resolveDispute, getDisputeStatus } from '../../services/disputeArbitrationService.js';
import { handleUploadError } from '../middleware/fileUpload.js';
import {
  validate,
  disputeListQueryRules,
  disputeEscrowIdParamRules,
} from '../middleware/validation.js';

const router = express.Router();
router.use(authMiddleware);

// ── List / Get ────────────────────────────────────────────────────────────────

router.get(
  '/',
  validate(disputeListQueryRules),
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
  validate(disputeEscrowIdParamRules),
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
  disputeController.uploadEvidence,
  disputeController.postEvidence,
  handleUploadError,
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
    tags: (req) => [`dispute:${req.params.id}`, `escrow:${req.params.id}`, 'disputes', 'escrows'],
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

// ── Arbitration endpoints ─────────────────────────────────────────────────────

router.post('/escrow/:escrowId/raise', async (req, res) => {
  try {
    const { reason, evidenceHash } = req.body;
    if (!reason) return res.status(400).json({ error: 'reason is required' });
    const result = await raiseDispute(
      req.params.escrowId,
      req.user?.walletAddress || req.body.raisedByAddress,
      reason,
      evidenceHash ?? null,
    );
    res.status(201).json(result);
  } catch (err) {
    const status = err.status ?? 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

router.post('/escrow/:escrowId/resolve-arbitration', async (req, res) => {
  try {
    const { resolution, arbitratorAddress, outcome } = req.body;
    if (!resolution || !arbitratorAddress) {
      return res.status(400).json({ error: 'resolution and arbitratorAddress are required' });
    }
    const result = await resolveDispute(
      req.params.escrowId,
      resolution,
      arbitratorAddress,
      outcome,
    );
    res.json(result);
  } catch (err) {
    const status = err.status ?? 500;
    res.status(status).json({ error: err.message, code: err.code });
  }
});

router.get('/escrow/:escrowId/status', async (req, res) => {
  try {
    const result = await getDisputeStatus(req.params.escrowId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
