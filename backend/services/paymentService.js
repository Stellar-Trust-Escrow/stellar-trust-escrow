import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const paymentService = {
  async createCheckoutSession({ address, amountUsd, escrowId }) {
    const sessionId = `cs_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const payment = await prisma.payment.create({
      data: { sessionId, address, amountUsd, escrowId, status: 'pending' },
    });
    const url = `${process.env.FRONTEND_URL}/pay/${sessionId}`;
    return { sessionId, url, payment };
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
