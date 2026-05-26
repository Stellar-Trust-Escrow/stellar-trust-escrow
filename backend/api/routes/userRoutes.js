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

const router = express.Router();
router.use(authMiddleware);

const validateAddress = [stellarAddressParam('address'), handleValidationErrors];
const validatePagination = [...paginationQuery, handleValidationErrors];

router.get('/:address', validateAddress, userController.getUserProfile);
router.get('/:address/escrows', validateAddress, validatePagination, userController.getUserEscrows);
router.get('/:address/stats', validateAddress, userController.getUserStats);

/**
 * @route  GET /api/users/:address/export
 * @desc   Export all user data in JSON format
 * @returns { version, exportedAt, userAddress, data: { escrows, payments, kyc, reputation } }
 */
router.get('/:address/export', authorizeParamAddress('address'), exportController.exportUserData);

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
router.get(
  '/:address/export/file',
  authorizeParamAddress('address'),
  exportController.downloadExportFile,
);

export default router;
