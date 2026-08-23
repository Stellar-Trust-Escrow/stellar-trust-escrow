import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const kycService = {
  async getStatus(address) {
    const record = await prisma.kycRecord.findUnique({ where: { address } });
    return record ? record.status : 'not_started';
  },

  async submit(address, documents) {
    return prisma.kycRecord.upsert({
      where: { address },
      update: { status: 'pending', documents, submittedAt: new Date() },
      create: { address, status: 'pending', documents, submittedAt: new Date() },
    });
  },

  async approve(address) {
    return prisma.kycRecord.update({
      where: { address },
      data: { status: 'approved', reviewedAt: new Date() },
    });
  },

  async reject(address, reason) {
    return prisma.kycRecord.update({
      where: { address },
      data: { status: 'rejected', rejectionReason: reason, reviewedAt: new Date() },
    });
  },

  async isApproved(address) {
    const record = await prisma.kycRecord.findUnique({ where: { address } });
    return record?.status === 'approved';
  },
};

export default kycService;
