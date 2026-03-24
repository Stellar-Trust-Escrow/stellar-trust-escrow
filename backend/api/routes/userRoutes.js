import express from 'express';
import userController from '../controllers/userController.js';

const router = express.Router();

/**
 * @route  GET /api/users/:address
 * @desc   Get a user's profile: reputation, escrow history, stats.
 * @param  address - Stellar public key (G...)
 */
router.get('/:address', userController.getUserProfile);

/**
 * @route  GET /api/users/:address/escrows
 * @desc   Get a paginated escrow list for a user with the standard pagination envelope.
 * @query  role (client|freelancer|all), status, page (default 1), limit (default 20, max 100)
 * @returns { data, page, limit, total, totalPages, hasNextPage, hasPreviousPage }
 */
router.get('/:address/escrows', userController.getUserEscrows);

/**
 * @route  GET /api/users/:address/stats
 * @desc   Aggregated stats: total volume, completion rate, avg milestone time.
 */
router.get('/:address/stats', userController.getUserStats);

export default router;
