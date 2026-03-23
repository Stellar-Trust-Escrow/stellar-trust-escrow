import express from 'express';
import escrowController from '../controllers/escrowController.js';

const router = express.Router();

/**
 * @route  GET /api/escrows
 * @desc   List escrows with the standard pagination envelope.
 * @query  page (default 1), limit (default 20, max 100), status, client, freelancer
 * @returns { data, page, limit, total, totalPages, hasNextPage, hasPreviousPage }
 */
router.get('/', escrowController.listEscrows);

/**
 * @route  POST /api/escrows/broadcast
 * @desc   Broadcast a pre-signed create_escrow transaction to the Stellar network.
 * @body   { signedXdr: string }
 */
router.post('/broadcast', escrowController.broadcastCreateEscrow);

/**
 * @route  GET /api/escrows/:id/milestones
 * @desc   List milestones for an escrow with the standard pagination envelope.
 * @query  page (default 1), limit (default 20, max 100)
 * @returns { data, page, limit, total, totalPages, hasNextPage, hasPreviousPage }
 */
router.get('/:id/milestones', escrowController.getMilestones);

/**
 * @route  GET /api/escrows/:id/milestones/:milestoneId
 * @desc   Get a single milestone.
 */
router.get('/:id/milestones/:milestoneId', escrowController.getMilestone);

/**
 * @route  GET /api/escrows/:id
 * @desc   Get full details for a single escrow including milestones.
 * @param  id - escrow_id from the contract
 */
router.get('/:id', escrowController.getEscrow);

export default router;
