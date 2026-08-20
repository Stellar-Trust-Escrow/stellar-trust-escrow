import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function recalculateFromEventHistory(tenantId) {
  const events = await prisma.escrowEvent.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'asc' },
  });

  let score = 50;
  for (const event of events) {
    if (event.type === 'COMPLETED') score = Math.min(100, score + 5);
    else if (event.type === 'DISPUTED') score = Math.max(0, score - 10);
    else if (event.type === 'RELEASED') score = Math.min(100, score + 3);
  }

  await prisma.reputationScore.upsert({
    where: { tenantId },
    update: { score, updatedAt: new Date() },
    create: { tenantId, score, updatedAt: new Date() },
  });

  return { tenantId, score };
}

export async function getScore(tenantId) {
  const record = await prisma.reputationScore.findUnique({ where: { tenantId } });
  return record?.score ?? 50;
}

export async function getLeaderboard(limit = 10) {
  return prisma.reputationScore.findMany({
    orderBy: { score: 'desc' },
    take: limit,
  });
}
