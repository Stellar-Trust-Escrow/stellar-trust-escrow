import express from 'express';
import paymentController from '../controllers/paymentController.js';
import {
  stellarAddressParam,
  stellarAddressBody,
  handleValidationErrors,
} from '../../middleware/validation.js';
import authMiddleware from '../middleware/auth.js';
import { authorizeBodyAddress, authorizeParamAddress } from '../middleware/authorization.js';

const router = express.Router();

const captureRawBody = (req, _res, next) => {
  let data = '';
  req.on('data', (chunk) => (data += chunk));
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
};

router.post('/webhook', captureRawBody, express.json(), paymentController.webhook);
router.post(
  '/checkout',
  stellarAddressBody('address'),
  handleValidationErrors,
  paymentController.createCheckout,
);
router.get('/status/:sessionId', paymentController.getStatus);
router.get(
  '/:address',
  stellarAddressParam('address'),
  handleValidationErrors,
  paymentController.listByAddress,
);
router.post('/:paymentId/refund', paymentController.refund);

/**
 * @route  POST /api/payments/checkout
 * @body   { address: string, amountUsd: number, escrowId?: string }
 * @desc   Create a Stripe Checkout session. Requires KYC Approved status.
 */
router.post(
  '/checkout',
  authMiddleware,
  authorizeBodyAddress('address'),
  paymentController.createCheckout,
);

/**
 * @route  GET /api/payments/status/:sessionId
 * @desc   Get payment record by Stripe session ID.
 */
router.get('/status/:sessionId', authMiddleware, paymentController.getStatus);

/**
 * @route  GET /api/payments/:address
 * @desc   List all payments for a Stellar address.
 */
router.get('/:address', authMiddleware, authorizeParamAddress('address'), paymentController.listByAddress);

/**
 * @route  POST /api/payments/:paymentId/refund
 * @desc   Issue a full refund for a completed payment.
 */
router.post('/:paymentId/refund', authMiddleware, paymentController.refund);

export default router;
