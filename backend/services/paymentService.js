/**
 * paymentService.js
 *
 * Fiat on-ramp via Stripe Checkout, backed by the existing Payment Prisma
 * model. This file did not exist before this PR — paymentController.js
 * already imported it, and its absence crashed the entire server at
 * startup (see PR description: `ERR_MODULE_NOT_FOUND` on every boot,
 * blocking any CI step that needs a running server, unrelated to what
 * this PR itself set out to build).
 *
 * Stripe calls are gated behind STRIPE_SECRET_KEY being configured, same
 * pattern as emailProviders.js/smsProviders.js ("<provider> not
 * configured") — the server still boots and every other endpoint works
 * fine without Stripe credentials; only the payment endpoints themselves
 * fail clearly if used unconfigured.
 */

import Stripe from 'stripe';
import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('service.payment');

const DEFAULT_TENANT = process.env.DEFAULT_TENANT_ID || 'default';

let stripeClient = null;
function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing).');
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

/**
 * Creates a Stripe Checkout session for a fiat-to-XLM funding flow and
 * records a Pending Payment row keyed to the resulting session id.
 */
async function createCheckoutSession({ address, amountUsd, escrowId }) {
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: 'Escrow funding' },
          unit_amount: Math.round(amountUsd * 100),
        },
        quantity: 1,
      },
    ],
    success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payments/cancelled`,
    metadata: { address, escrowId: escrowId ? String(escrowId) : '' },
  });

  const payment = await prisma.payment.create({
    data: {
      tenantId: DEFAULT_TENANT,
      address,
      escrowId: escrowId ? BigInt(escrowId) : null,
      stripeSessionId: session.id,
      amountFiat: Math.round(amountUsd * 100),
      currency: 'usd',
      status: 'Pending',
    },
  });

  log.info({ message: 'payment_checkout_created', paymentId: payment.id, sessionId: session.id });
  return { checkoutUrl: session.url, sessionId: session.id, paymentId: payment.id };
}

async function getBySessionId(sessionId) {
  return prisma.payment.findUnique({ where: { stripeSessionId: sessionId } });
}

async function getByAddress(address) {
  return prisma.payment.findMany({
    where: { address },
    orderBy: { createdAt: 'desc' },
  });
}

async function getById(paymentId) {
  return prisma.payment.findUnique({ where: { id: paymentId } });
}

/**
 * Issues a full refund via Stripe and marks the Payment row Refunded.
 * Only Completed payments can be refunded — anything else (Pending,
 * already Refunded, Failed) is rejected with a message the controller
 * maps to a 400.
 */
async function refund(paymentId) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new Error('Payment not found');
  if (payment.status !== 'Completed') {
    throw new Error(`Cannot refund a payment with status "${payment.status}".`);
  }
  if (!payment.stripePaymentIntent) {
    throw new Error('Cannot refund a payment with no recorded Stripe payment intent.');
  }

  const stripe = getStripeClient();
  const stripeRefund = await stripe.refunds.create({ payment_intent: payment.stripePaymentIntent });

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'Refunded', refundId: stripeRefund.id },
  });

  log.info({ message: 'payment_refunded', paymentId, refundId: stripeRefund.id });
  return updated;
}

/**
 * Verifies and processes a Stripe webhook event. Signature verification
 * uses Stripe's own constructEvent — this is what actually protects the
 * endpoint, not an application-level check.
 */
async function handleWebhook(rawBody, signature) {
  const stripe = getStripeClient();
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe webhook secret is not configured (STRIPE_WEBHOOK_SECRET missing).');
  }

  const event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      await prisma.payment.updateMany({
        where: { stripeSessionId: session.id },
        data: {
          status: 'Completed',
          stripePaymentIntent: session.payment_intent || undefined,
        },
      });
      log.info({ message: 'payment_webhook_completed', sessionId: session.id });
      break;
    }
    case 'checkout.session.expired': {
      const session = event.data.object;
      await prisma.payment.updateMany({
        where: { stripeSessionId: session.id },
        data: { status: 'Failed' },
      });
      log.info({ message: 'payment_webhook_expired', sessionId: session.id });
      break;
    }
    default:
      log.info({ message: 'payment_webhook_ignored', type: event.type });
  }

  return { received: true };
}

export default {
  createCheckoutSession,
  getBySessionId,
  getByAddress,
  getById,
  refund,
  handleWebhook,
};
