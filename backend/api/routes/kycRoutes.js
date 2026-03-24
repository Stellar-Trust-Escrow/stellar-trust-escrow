import express from 'express';
import kycController from '../controllers/kycController.js';

const router = express.Router();

/**
 * Capture raw body for webhook signature verification before JSON parsing.
 */
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
router.post('/token', kycController.getToken);

/**
 * @route  GET /api/kyc/status/:address
 * @desc   Get KYC verification status for a Stellar address.
 */
router.get('/status/:address', kycController.getStatus);

/**
 * @route  POST /api/kyc/webhook
 * @desc   Sumsub webhook endpoint — updates verification status.
 */
router.post('/webhook', captureRawBody, express.json(), kycController.webhook);

/**
 * @route  GET /api/kyc/admin
 * @desc   Admin: list all KYC records with optional status filter.
 * @query  status (Pending|Init|Processing|Approved|Declined), page, limit
 *
 * TODO (contributor): protect with admin auth middleware
 */
router.get('/admin', kycController.adminList);

export default router;
