import express from 'express';
import adminAuth from '../middleware/adminAuth.js';
import authMiddleware from '../middleware/auth.js';
import { authorizeBodyAddress, authorizeParamAddress } from '../middleware/authorization.js';
import kycController from '../controllers/kycController.js';
import {
  stellarAddressParam,
  stellarAddressBody,
  handleValidationErrors,
} from '../../middleware/validation.js';

const router = express.Router();

const captureRawBody = (req, _res, next) => {
  let data = '';
  req.on('data', (chunk) => (data += chunk));
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
};

/**
 * @route  POST /api/kyc/token
 * @desc   Generate a Sumsub SDK access token for the frontend widget.
 * @body   { address: string }
 */
router.post(
  '/token',
  authMiddleware,
  stellarAddressBody('address'),
  handleValidationErrors,
  authorizeBodyAddress('address'),
  kycController.getToken,
);

/**
 * @route  GET /api/kyc/status/:address
 * @desc   Get KYC verification status for a Stellar address.
 */
router.get(
  '/status/:address',
  authMiddleware,
  stellarAddressParam('address'),
  handleValidationErrors,
  authorizeParamAddress('address'),
  kycController.getStatus,
);

/**
 * @route  POST /api/kyc/webhook
 * @desc   Sumsub webhook endpoint — updates verification status.
 */
router.post('/webhook', captureRawBody, express.json(), kycController.webhook);
router.get('/admin', adminAuth, kycController.adminList);

export default router;
