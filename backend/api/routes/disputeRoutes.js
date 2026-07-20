import express from 'express';
import disputeController from '../controllers/disputeController.js';
import authMiddleware from '../middleware/auth.js';
import adminAuth from '../middleware/adminAuth.js';

const router = express.Router();
router.use(authMiddleware);

// ── List / History ────────────────────────────────────────────────────────────

router.get('/', disputeController.listDisputes);
router.get('/history', disputeController.getResolutionHistory);

// ── Open dispute for an escrow ────────────────────────────────────────────────

router.post('/:escrowId/open', disputeController.openDispute);

// ── Individual dispute ────────────────────────────────────────────────────────

router.get('/:disputeId', disputeController.getDispute);

// ── Evidence ──────────────────────────────────────────────────────────────────

router.post('/:disputeId/evidence', disputeController.postEvidence);
router.get('/:disputeId/evidence', disputeController.listEvidence);

// ── Arbiter ruling ────────────────────────────────────────────────────────────

router.post('/:disputeId/rule', disputeController.submitRuling);

// ── Appeal ────────────────────────────────────────────────────────────────────

router.post('/:disputeId/appeal', disputeController.fileAppeal);

// ── Admin-only actions ────────────────────────────────────────────────────────

router.post('/:disputeId/assign-arbiter', adminAuth, disputeController.assignArbiter);
router.post('/:disputeId/finalize', adminAuth, disputeController.finalizeDispute);

export default router;
