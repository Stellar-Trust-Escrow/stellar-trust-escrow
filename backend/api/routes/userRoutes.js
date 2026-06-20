import express from 'express';
import userController from '../controllers/userController.js';
import {
  stellarAddressParam,
  paginationQuery,
  handleValidationErrors,
} from '../../middleware/validation.js';
import exportController from '../controllers/exportController.js';
import authMiddleware from '../middleware/auth.js';
import { authorizeParamAddress } from '../middleware/authorization.js';
import adminAuth, { optionalAdminAuth } from '../middleware/adminAuth.js';
import { createSlidingWindowRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();
router.use(optionalAdminAuth, authMiddleware);

const validateAddress = [stellarAddressParam('address'), handleValidationErrors];
const validatePagination = [...paginationQuery, handleValidationErrors];
const exportRateLimit = createSlidingWindowRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  prefix: 'data-export',
  message: 'Too many export requests for this address. Please try again later.',
  keyGenerator: (req) => `data-export:address:${req.params?.address || 'unknown'}`,
});

router.get('/:address', validateAddress, userController.getUserProfile);
router.get('/:address/escrows', validateAddress, validatePagination, userController.getUserEscrows);
router.get('/:address/stats', validateAddress, userController.getUserStats);

/**
 * @route  GET /api/users/:address/export
 * @desc   Export all user data in JSON format
 * @returns { version, exportedAt, userAddress, data: { escrows, payments, kyc, reputation } }
 */
router.get('/:address/export', exportRateLimit, exportController.exportUserData);

/**
 * @route  POST /api/users/:address/import
 * @desc   Import user data from JSON
 * @body   { data: {...}, mode: 'merge' | 'replace' }
 * @returns { success, results }
 */
router.post('/:address/import', authorizeParamAddress('address'), exportController.importUserData);

/**
 * @route  GET /api/users/:address/export/file
 * @desc   Download user data as a file
 * @returns { file: 'data.json', content: {...} }
 */
router.get('/:address/export/file', exportRateLimit, exportController.downloadExportFile);

/**
 * @route  DELETE /api/users/:address/data
 * @desc   Pseudonymize user data for GDPR deletion/admin retention
 */
router.delete('/:address/data', adminAuth, exportController.deleteUserData);

export default router;
