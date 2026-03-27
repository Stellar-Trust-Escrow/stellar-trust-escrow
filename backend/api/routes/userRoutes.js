import express from 'express';
import userController from '../controllers/userController.js';
import {
  stellarAddressParam,
  paginationQuery,
  handleValidationErrors,
} from '../../middleware/validation.js';

const router = express.Router();

const validateAddress = [stellarAddressParam('address'), handleValidationErrors];
const validatePagination = [...paginationQuery, handleValidationErrors];

router.get('/:address', validateAddress, userController.getUserProfile);
router.get('/:address/escrows', validateAddress, validatePagination, userController.getUserEscrows);
router.get('/:address/stats', validateAddress, userController.getUserStats);

export default router;
