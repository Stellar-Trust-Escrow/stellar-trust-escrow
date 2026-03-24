import paymentService from '../../services/paymentService.js';
import kycService from '../../services/kycService.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../lib/errors.js';
import asyncHandler from '../../lib/asyncHandler.js';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/** POST /api/payments/checkout — create a Stripe checkout session. */
const createCheckout = asyncHandler(async (req, res) => {
  const { address, amountUsd, escrowId } = req.body;

  if (!address || !STELLAR_ADDRESS_RE.test(address)) {
    throw new ValidationError('Valid Stellar address required');
  }
  if (!amountUsd || typeof amountUsd !== 'number' || amountUsd <= 0) {
    throw new ValidationError('amountUsd must be a positive number');
  }

  // KYC gate — require Approved status for fiat on-ramp
  const kyc = await kycService.getStatus(address);
  if (kyc?.status !== 'Approved') {
    throw new ForbiddenError('KYC verification required before funding via fiat');
  }

  const result = await paymentService.createCheckoutSession({ address, amountUsd, escrowId });
  res.json(result);
});

/** GET /api/payments/status/:sessionId — get payment status by Stripe session ID. */
const getStatus = asyncHandler(async (req, res) => {
  const payment = await paymentService.getBySessionId(req.params.sessionId);
  if (!payment) throw new NotFoundError('Payment not found');
  res.json(payment);
});

/** GET /api/payments/:address — list payments for a Stellar address. */
const listByAddress = asyncHandler(async (req, res) => {
  const { address } = req.params;
  if (!STELLAR_ADDRESS_RE.test(address)) {
    throw new ValidationError('Invalid Stellar address');
  }
  const payments = await paymentService.getByAddress(address);
  res.json(payments);
});

/** POST /api/payments/:paymentId/refund — issue a full refund. */
const refund = asyncHandler(async (req, res) => {
  try {
    const payment = await paymentService.refund(req.params.paymentId);
    res.json(payment);
  } catch (err) {
    if (err.message.startsWith('Cannot refund')) {
      throw new ValidationError(err.message);
    }
    throw err;
  }
});

/** POST /api/payments/webhook — Stripe webhook receiver. */
const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (!signature) throw new ValidationError('Missing stripe-signature header');
  try {
    await paymentService.handleWebhook(req.rawBody, signature);
  } catch (err) {
    throw new ValidationError(err.message);
  }
  res.json({ ok: true });
});

export default { createCheckout, getStatus, listByAddress, refund, webhook };
