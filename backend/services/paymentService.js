/**
 * Payment Service — Stripe integration
 *
 * Handles checkout session creation, fiat-to-crypto conversion tracking,
 * webhook event processing, and refunds.
 *
 * Docs: https://stripe.com/docs/api
 */

import Stripe from 'stripe';
import prisma from '../lib/prisma.js';
import { getCurrentTenantId, withTenantScopeBypassed } from '../lib/tenantContext.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' });

const STELLAR_HORIZON = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';

/**
 * Fetch the current XLM/USD price from Stellar DEX via Horizon.
 * Returns price as a float (USD per 1 XLM).
 */
async function getXlmUsdPrice() {
  const res = await fetch(
    `${STELLAR_HORIZON}/order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4&buying_asset_code=USDC&buying_asset_issuer=${process.env.USDC_ISSUER}&limit=1`,
  );
  if (!res.ok) throw new Error('Failed to fetch XLM price');
  const { bids } = await res.json();
  if (!bids?.length) throw new Error('No bids in order book');
  return parseFloat(bids[0].price);
}

/**
 * Create a Stripe Checkout session for funding an escrow.
 * @param {object} opts
 * @param {string} opts.address  - Stellar address of the payer
 * @param {number} opts.amountUsd - Amount in USD (dollars, not cents)
 * @param {string} [opts.escrowId] - Optional escrow to fund
 * @returns {{ sessionId, url, paymentId }}
 */
async function createCheckoutSession({ address, amountUsd, escrowId }) {
  const amountCents = Math.round(amountUsd * 100);
  const tenantId = getCurrentTenantId();

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: 'Escrow Funding',
            description: `Fund escrow on StellarTrustEscrow`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      address,
      escrowId: escrowId?.toString() ?? '',
      tenantId: tenantId ?? '',
    },
    success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
  });

  const payment = await prisma.payment.create({
    data: {
      address,
      escrowId: escrowId ? BigInt(escrowId) : null,
      stripeSessionId: session.id,
      amountFiat: amountCents,
      status: 'Pending',
    },
  });

  return { sessionId: session.id, url: session.url, paymentId: payment.id };
}

/**
 * Get payment record by Stripe session ID.
 */
async function getBySessionId(sessionId) {
  return prisma.payment.findUnique({
    where: { stripeSessionId: sessionId },
    select: {
      id: true,
      address: true,
      escrowId: true,
      amountFiat: true,
      amountCrypto: true,
      currency: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function getById(paymentId) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      address: true,
      status: true,
      stripePaymentIntent: true,
      refundId: true,
    },
  });
}

/**
 * Get payments for a Stellar address — paginated with a safe default limit.
 * Uses the @@index([address, createdAt(sort: Desc)]) composite index.
 */
async function getByAddress(address, { take = 50, skip = 0 } = {}) {
  return prisma.payment.findMany({
    where: { address },
    orderBy: { createdAt: 'desc' },
    take,
    skip,
    select: {
      id: true,
      escrowId: true,
      amountFiat: true,
      amountCrypto: true,
      currency: true,
      status: true,
      createdAt: true,
    },
  });
}

/**
 * Issue a full refund for a completed payment.
 * @param {string} paymentId - internal Payment.id
 */
async function refund(paymentId) {
  const payment = await prisma.payment.findUniqueOrThrow({
    where: { id: paymentId },
    select: { id: true, status: true, stripePaymentIntent: true },
  });

  if (payment.status !== 'Completed') {
    throw new Error(`Cannot refund payment in status: ${payment.status}`);
  }

  const stripeRefund = await stripe.refunds.create({
    payment_intent: payment.stripePaymentIntent,
  });

  return prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'Refunded', refundId: stripeRefund.id },
  });
}

/**
 * Process a Stripe webhook event and update payment status.
 * Returns the updated payment record or null for unhandled events.
 */
async function handleWebhook(rawBody, signature) {
  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET,
  );

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const tenantId = session.metadata?.tenantId || getCurrentTenantId();
      // Compute crypto equivalent
      let amountCrypto = null;
      try {
        const xlmPrice = await getXlmUsdPrice();
        const usd = session.amount_total / 100;
        amountCrypto = (usd / xlmPrice).toFixed(7) + ' XLM';
      } catch {
        // non-fatal — conversion is informational
      }

      const where = {
        stripeSessionId: session.id,
        ...(tenantId ? { tenantId } : {}),
      };

      await withTenantScopeBypassed(() =>
        prisma.payment.updateMany({
          where,
          data: {
            status: 'Completed',
            stripePaymentIntent: session.payment_intent,
            amountCrypto,
          },
        }),
      );

      return withTenantScopeBypassed(() => prisma.payment.findFirst({ where }));
    }

    case 'checkout.session.expired':
    case 'payment_intent.payment_failed': {
      const obj = event.data.object;
      const tenantId = obj.metadata?.tenantId || getCurrentTenantId();
      const where =
        obj.object === 'checkout.session'
          ? { stripeSessionId: obj.id, ...(tenantId ? { tenantId } : {}) }
          : { stripePaymentIntent: obj.id, ...(tenantId ? { tenantId } : {}) };
      return withTenantScopeBypassed(() =>
        prisma.payment.updateMany({ where, data: { status: 'Failed' } }),
      );
    }

    case 'charge.refunded': {
      const refundId = event.data.object.refunds?.data?.[0]?.id;
      if (refundId) {
        return withTenantScopeBypassed(() =>
          prisma.payment.updateMany({
            where: { refundId },
            data: { status: 'Refunded' },
          }),
        );
      }
      return null;
    }

    default:
      return null;
  }
}

export default { createCheckoutSession, getById, getBySessionId, getByAddress, refund, handleWebhook };
