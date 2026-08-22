/**
 * Payment Service
 *
 * Handles Stripe checkout sessions, payment status lookups, refunds,
 * and webhook processing for fiat on-ramp payments.
 */

import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('service.paymentService');

/**
 * Create a Stripe checkout session for funding an escrow via fiat.
 */
export async function createCheckoutSession({ address, amountUsd, escrowId }) {
  // Stub — wire to Stripe SDK in production
  throw new Error('Stripe integration not yet configured. Set STRIPE_SECRET_KEY.');
}

/**
 * Look up a payment by Stripe session ID.
 */
export async function getBySessionId(sessionId) {
  return prisma.payment.findUnique({ where: { stripeSessionId: sessionId } });
}

/**
 * Look up a payment by internal payment ID.
 */
export async function getById(paymentId) {
  return prisma.payment.findUnique({ where: { id: paymentId } });
}

/**
 * List all payments for a Stellar wallet address.
 */
export async function getByAddress(address) {
  return prisma.payment.findMany({
    where: { address },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Issue a full refund for a completed payment.
 */
export async function refund(paymentId) {
  const payment = await getById(paymentId);
  if (!payment) throw new Error('Payment not found');
  if (payment.status !== 'Completed') {
    throw new Error(`Cannot refund a payment with status: ${payment.status}`);
  }
  // Stub — wire to Stripe refund API in production
  return prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'Refunded' },
  });
}

/**
 * Handle an incoming Stripe webhook event.
 */
export async function handleWebhook(rawBody, signature) {
  // Stub — wire to stripe.webhooks.constructEvent in production
  throw new Error('Stripe webhook handler not yet configured. Set STRIPE_WEBHOOK_SECRET.');
}

export default {
  createCheckoutSession,
  getBySessionId,
  getById,
  getByAddress,
  refund,
  handleWebhook,
};
