import express from 'express';
import paymentController from '../controllers/paymentController.js';

const router = express.Router();

/** Capture raw body for Stripe webhook signature verification. */
const captureRawBody = (req, _res, next) => {
  let data = '';
  req.on('data', (chunk) => (data += chunk));
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
};

/**
 * @route  POST /api/payments/webhook
 * @desc   Stripe webhook — must be registered before express.json() parses the body.
 */
router.post('/webhook', captureRawBody, express.json(), paymentController.webhook);

/**
 * @route  POST /api/payments/checkout
 * @body   { address: string, amountUsd: number, escrowId?: string }
 * @desc   Create a Stripe Checkout session. Requires KYC Approved status.
 */
router.post('/checkout', paymentController.createCheckout);

/**
 * @route  GET /api/payments/status/:sessionId
 * @desc   Get payment record by Stripe session ID.
 */
router.get('/status/:sessionId', paymentController.getStatus);

/**
 * @route  GET /api/payments/:address
 * @desc   List all payments for a Stellar address.
 */
router.get('/:address', paymentController.listByAddress);

/**
 * @route  POST /api/payments/:paymentId/refund
 * @desc   Issue a full refund for a completed payment.
 * TODO (contributor): protect with auth middleware
 */
router.post('/:paymentId/refund', paymentController.refund);

export default router;
