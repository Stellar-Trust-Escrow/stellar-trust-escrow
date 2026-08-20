import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2023-10-16' });

const paymentService = {
  async createCheckoutSession({ address, amountUsd, escrowId }) {
    const amountCents = Math.round(amountUsd * 100);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Escrow funding: ${escrowId}` },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      metadata: { address, escrowId },
      success_url: `${process.env.FRONTEND_URL}/escrow/${escrowId}?payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/escrow/${escrowId}?payment=cancelled`,
    });

    const payment = await prisma.payment.create({
      data: {
        sessionId: session.id,
        address,
        amountUsd,
        escrowId,
        status: 'pending',
      },
    });

    return { sessionId: session.id, url: session.url, payment };
  },

  async getBySessionId(sessionId) {
    return prisma.payment.findUnique({ where: { sessionId } });
  },

  async getByAddress(address) {
    return prisma.payment.findMany({ where: { address }, orderBy: { createdAt: 'desc' } });
  },

  async getById(id) {
    return prisma.payment.findUnique({ where: { id } });
  },

  async updateStatus(sessionId, status) {
    return prisma.payment.update({ where: { sessionId }, data: { status } });
  },
};

export default paymentService;
