import express from 'express';
import multer from 'multer';
import userController from '../controllers/userController.js';
import exportController from '../controllers/exportController.js';

const upload = multer({ dest: 'uploads/' });

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

/**
 * @route  GET /api/users/:address/export
 * @desc   Export all user data in JSON format
 * @returns { version, exportedAt, userAddress, data: { escrows, payments, kyc, reputation } }
 */
router.get('/:address/export', exportController.exportUserData);

/**
 * @route  POST /api/users/:address/import
 * @desc   Import user data from JSON
 * @body   { data: {...}, mode: 'merge' | 'replace' }
 * @returns { success, results }
 */
router.post('/:address/import', exportController.importUserData);

/**
 * @route  GET /api/users/:address/export/file
 * @desc   Download user data as a file
 * @returns { file: 'data.json', content: {...} }
 */
router.get('/:address/export/file', exportController.downloadExportFile);

export default router;
