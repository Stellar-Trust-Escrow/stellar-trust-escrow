/**
 * Escrow API Routes
 *
 * All REST endpoints for querying and submitting escrow data.
 * Write operations (create, approve, etc.) accept pre-signed Stellar
 * transactions from the frontend — the backend only broadcasts them.
 */

import express from 'express';
const router = express.Router();
import escrowController from '../controllers/escrowController.js';

// TODO (contributor — easy, Issue #19): Add input validation middleware
// const { validateEscrowId, validatePagination } = require('../middleware/validators');

/**
 * @route  GET /api/escrows
 * @desc   List all escrows, paginated. Supports filtering by status and address.
 * @query  page, limit, status, client, freelancer
 */
router.get('/', escrowController.listEscrows);

/**
 * @route  GET /api/escrows/:id
 * @desc   Get full details for a single escrow including milestones.
 * @param  id — escrow_id from the contract
 */
router.get('/:id', escrowController.getEscrow);

/**
 * @route  POST /api/escrows/broadcast
 * @desc   Broadcast a pre-signed create_escrow transaction to the Stellar network.
 * @body   { signedXdr: string }
 * TODO (contributor — medium, Issue #20): Implement transaction broadcast + DB sync
 */
router.post('/broadcast', escrowController.broadcastCreateEscrow);

/**
 * @route  GET /api/escrows/:id/milestones
 * @desc   List all milestones for an escrow.
 */
router.get('/:id/milestones', escrowController.getMilestones);

/**
 * @route  GET /api/escrows/:id/milestones/:milestoneId
 * @desc   Get a single milestone.
 */
router.get('/:id/milestones/:milestoneId', escrowController.getMilestone);

/**
 * @route  GET /api/escrows/stats/:address
 * @desc   Aggregated per-user stats: total, active, completed, disputed escrows,
 *         success rate %, and total value locked across active escrows.
 * @param  address — Stellar public key (G...)
 */
router.get('/stats/:address', escrowController.getUserStats);

/**
 * @route  GET /api/escrows/activity/:address
 * @desc   10 most recent escrows for the given address, ordered by last update.
 *         Used by the dashboard activity timeline.
 * @param  address — Stellar public key (G...)
 */
router.get('/activity/:address', escrowController.getUserActivity);

export default router;
