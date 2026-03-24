import paymentService from '../../services/paymentService.js';
import kycService from '../../services/kycService.js';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/** POST /api/payments/checkout — create a Stripe checkout session. */
const createCheckout = async (req, res) => {
  try {
    const { address, amountUsd, escrowId } = req.body;

    if (!address || !STELLAR_ADDRESS_RE.test(address)) {
      return res.status(400).json({ error: 'Valid Stellar address required' });
    }
    if (!amountUsd || typeof amountUsd !== 'number' || amountUsd <= 0) {
      return res.status(400).json({ error: 'amountUsd must be a positive number' });
    }

    // KYC gate — require Approved status for fiat on-ramp
    const kyc = await kycService.getStatus(address);
    if (kyc?.status !== 'Approved') {
      return res.status(403).json({ error: 'KYC verification required before funding via fiat' });
    }

    const result = await paymentService.createCheckoutSession({ address, amountUsd, escrowId });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** GET /api/payments/status/:sessionId — get payment status by Stripe session ID. */
const getStatus = async (req, res) => {
  try {
    const payment = await paymentService.getBySessionId(req.params.sessionId);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** GET /api/payments/:address — list payments for a Stellar address. */
const listByAddress = async (req, res) => {
  try {
    const { address } = req.params;
    if (!STELLAR_ADDRESS_RE.test(address)) {
      return res.status(400).json({ error: 'Invalid Stellar address' });
    }
    const payments = await paymentService.getByAddress(address);
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/** POST /api/payments/:paymentId/refund — issue a full refund. */
const refund = async (req, res) => {
  try {
    const payment = await paymentService.refund(req.params.paymentId);
    res.json(payment);
  } catch (err) {
    const status = err.message.startsWith('Cannot refund') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
};

/** POST /api/payments/webhook — Stripe webhook receiver. */
const webhook = async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    if (!signature) return res.status(400).json({ error: 'Missing stripe-signature header' });
    await paymentService.handleWebhook(req.rawBody, signature);
    res.json({ ok: true });
  } catch (err) {
    // Stripe throws on invalid signature
    res.status(400).json({ error: err.message });
  }
};

export default { createCheckout, getStatus, listByAddress, refund, webhook };
