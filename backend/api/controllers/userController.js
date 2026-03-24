import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import { ValidationError } from '../../lib/errors.js';
import asyncHandler from '../../lib/asyncHandler.js';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

function validateAddress(address) {
  if (!STELLAR_ADDRESS_RE.test(address)) {
    throw new ValidationError('Invalid Stellar address');
  }
}

const ESCROW_SUMMARY_SELECT = {
  id: true,
  status: true,
  totalAmount: true,
  remainingBalance: true,
  deadline: true,
  createdAt: true,
};

const getUserProfile = asyncHandler(async (req, res) => {
  const { address } = req.params;
  validateAddress(address);

  const cacheKey = `users:profile:${address}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const [reputation, recentEscrows] = await Promise.all([
    prisma.reputationRecord.findUnique({ where: { address } }),
    prisma.escrow.findMany({
      where: { OR: [{ clientAddress: address }, { freelancerAddress: address }] },
      select: ESCROW_SUMMARY_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  const profile = {
    address,
    reputation: reputation ?? {
      address,
      totalScore: 0,
      completedEscrows: 0,
      disputedEscrows: 0,
      disputesWon: 0,
      totalVolume: '0',
    },
    recentEscrows,
  };

  cache.set(cacheKey, profile, 60);
  res.json(profile);
});

const getUserEscrows = asyncHandler(async (req, res) => {
  const { address } = req.params;
  validateAddress(address);

  const { role = 'all', status } = req.query;
  const { page, limit, skip } = parsePagination(req.query);

  const where = {};
  if (status) where.status = status;

  if (role === 'client') {
    where.clientAddress = address;
  } else if (role === 'freelancer') {
    where.freelancerAddress = address;
  } else {
    where.OR = [{ clientAddress: address }, { freelancerAddress: address }];
  }

  const cacheKey = `users:escrows:${address}:${role}:${status}:${page}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const [data, total] = await prisma.$transaction([
    prisma.escrow.findMany({ where, select: ESCROW_SUMMARY_SELECT, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.escrow.count({ where }),
  ]);

  const result = buildPaginatedResponse(data, { total, page, limit });
  cache.set(cacheKey, result, 15);
  res.json(result);
});

const getUserStats = asyncHandler(async (req, res) => {
  const { address } = req.params;
  validateAddress(address);

  const cacheKey = `users:stats:${address}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const [reputation, escrowCounts] = await Promise.all([
    prisma.reputationRecord.findUnique({
      where: { address },
      select: { totalScore: true, completedEscrows: true, disputedEscrows: true, totalVolume: true },
    }),
    prisma.escrow.groupBy({
      by: ['status'],
      where: { OR: [{ clientAddress: address }, { freelancerAddress: address }] },
      _count: { id: true },
    }),
  ]);

  const countsByStatus = Object.fromEntries(escrowCounts.map((record) => [record.status, record._count.id]));
  const totalEscrows = escrowCounts.reduce((sum, record) => sum + record._count.id, 0);
  const completed = countsByStatus.Completed ?? 0;

  const stats = {
    address,
    totalEscrows,
    completionRate: totalEscrows > 0 ? (completed / totalEscrows).toFixed(4) : '0',
    escrowsByStatus: countsByStatus,
    reputation: reputation ?? null,
  };

  cache.set(cacheKey, stats, 120);
  res.json(stats);
});

export default { getUserProfile, getUserEscrows, getUserStats };
