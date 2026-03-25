import express from 'express';
import disputeController from '../controllers/disputeController.js';

const router = express.Router();

// ── List / Get ────────────────────────────────────────────────────────────────

/** GET /api/disputes — paginated list */
router.get('/', disputeController.listDisputes);

/** GET /api/disputes/history — resolved disputes with resolution metadata */
router.get('/history', disputeController.getResolutionHistory);

/** GET /api/disputes/:escrowId — dispute detail by escrow id */
router.get('/:escrowId', disputeController.getDispute);

// ── Evidence ──────────────────────────────────────────────────────────────────

/** POST /api/disputes/:id/evidence — submit evidence */
router.post('/:id/evidence', disputeController.postEvidence);

/** GET /api/disputes/:id/evidence — list evidence */
router.get('/:id/evidence', disputeController.listEvidence);

// ── Automated Resolution ──────────────────────────────────────────────────────

/** POST /api/disputes/:id/resolve/auto — trigger automated resolution */
router.post('/:id/resolve/auto', disputeController.autoResolve);

/** GET /api/disputes/:id/resolve/recommendation — get resolution recommendation */
router.get('/:id/resolve/recommendation', disputeController.getRecommendation);

// ── Appeals ───────────────────────────────────────────────────────────────────

/** POST /api/disputes/:id/appeals — submit an appeal */
router.post('/:id/appeals', disputeController.postAppeal);

/** PATCH /api/disputes/appeals/:appealId — review an appeal (admin) */
router.patch('/appeals/:appealId', disputeController.patchAppeal);

export default router;
