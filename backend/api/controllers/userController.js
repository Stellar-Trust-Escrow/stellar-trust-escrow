import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import { logControllerError } from '../../config/logger.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

function validateAddress(address, res) {
  if (!STELLAR_ADDRESS_RE.test(address)) {
    res.status(400).json({ error: 'Invalid Stellar address' });
    return false;
  }
  return true;
}

const ESCROW_SUMMARY_SELECT = {
  id: true,
  status: true,
  totalAmount: true,
  remainingBalance: true,
  deadline: true,
  createdAt: true,
};

const getUserProfile = async (req, res) => {
  try {
    const { address } = req.params;
    if (!validateAddress(address, res)) return;

    const cacheKey = `users:profile:${address}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [reputation, clientEscrows, freelancerEscrows, userProfile] = await Promise.all([
      prisma.reputationRecord.findUnique({ where: { address } }),
      prisma.escrow.findMany({
        where: { clientAddress: address },
        select: { ...ESCROW_SUMMARY_SELECT, clientAddress: true, freelancerAddress: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.escrow.findMany({
        where: { freelancerAddress: address },
        select: { ...ESCROW_SUMMARY_SELECT, clientAddress: true, freelancerAddress: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.userProfile.findUnique({ where: { address } }),
    ]);

    const recentEscrows = [...clientEscrows, ...freelancerEscrows]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5);

    const profile = {
      address,
      ...userProfile,
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

    await cache.set(cacheKey, profile, 60);
    res.json(profile);
  } catch (err) {
    logControllerError('users.getUserProfile', err, req);
    res.status(500).json({ error: err.message });
  }
};

const getUserEscrows = async (req, res) => {
  try {
    const { address } = req.params;
    if (!validateAddress(address, res)) return;

    const { role = 'all', status } = req.query;
    const { page, limit, skip } = parsePagination(req.query);

    const cacheKey = `users:escrows:${address}:${role}:${status}:${page}:${limit}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    if (role === 'client' || role === 'freelancer') {
      const where = role === 'client' ? { clientAddress: address } : { freelancerAddress: address };
      if (status) where.status = status;

      const [data, total] = await prisma.$transaction([
        prisma.escrow.findMany({
          where,
          select: ESCROW_SUMMARY_SELECT,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.escrow.count({ where }),
      ]);

      const result = buildPaginatedResponse(data, { total, page, limit });
      await cache.set(cacheKey, result, 15);
      return res.json(result);
    }

    const clientWhere = { clientAddress: address };
    const freelancerWhere = { freelancerAddress: address };
    if (status) {
      clientWhere.status = status;
      freelancerWhere.status = status;
    }

    const [clientCount, freelancerCount] = await Promise.all([
      prisma.escrow.count({ where: clientWhere }),
      prisma.escrow.count({ where: freelancerWhere }),
    ]);

    const total = clientCount + freelancerCount;

    const [clientEscrows, freelancerEscrows] = await Promise.all([
      prisma.escrow.findMany({
        where: clientWhere,
        select: ESCROW_SUMMARY_SELECT,
        orderBy: { createdAt: 'desc' },
        take: skip + limit,
      }),
      prisma.escrow.findMany({
        where: freelancerWhere,
        select: ESCROW_SUMMARY_SELECT,
        orderBy: { createdAt: 'desc' },
        take: skip + limit,
      }),
    ]);

    const merged = [...clientEscrows, ...freelancerEscrows]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(skip, skip + limit);

    const result = buildPaginatedResponse(merged, { total, page, limit });
    await cache.set(cacheKey, result, 15);
    res.json(result);
  } catch (err) {
    logControllerError('users.getUserEscrows', err, req);
    res.status(500).json({ error: err.message });
  }
};

const getUserStats = async (req, res) => {
  try {
    const { address } = req.params;
    if (!validateAddress(address, res)) return;

    const cacheKey = `users:stats:${address}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [reputation, clientCounts, freelancerCounts] = await Promise.all([
      prisma.reputationRecord.findUnique({
        where: { address },
        select: {
          totalScore: true,
          completedEscrows: true,
          disputedEscrows: true,
          totalVolume: true,
        },
      }),
      prisma.escrow.groupBy({
        by: ['status'],
        where: { clientAddress: address },
        _count: { id: true },
      }),
      prisma.escrow.groupBy({
        by: ['status'],
        where: { freelancerAddress: address },
        _count: { id: true },
      }),
    ]);

    const countsByStatus = {};
    for (const record of [...clientCounts, ...freelancerCounts]) {
      countsByStatus[record.status] = (countsByStatus[record.status] ?? 0) + record._count.id;
    }

    const totalEscrows = Object.values(countsByStatus).reduce((sum, c) => sum + c, 0);
    const completed = countsByStatus.Completed ?? 0;

    const stats = {
      address,
      totalEscrows,
      completionRate: totalEscrows > 0 ? (completed / totalEscrows).toFixed(4) : '0',
      escrowsByStatus: countsByStatus,
      reputation: reputation ?? null,
    };

    await cache.set(cacheKey, stats, 120);
    res.json(stats);
  } catch (err) {
    logControllerError('users.getUserStats', err, req);
    res.status(500).json({ error: err.message });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const { address } = req.params;
    if (!validateAddress(address, res)) return;
    
    const { displayName, bio, preferences } = req.body;

    const updatedProfile = await prisma.userProfile.upsert({
      where: { address },
      update: {
        ...(displayName !== undefined && { displayName }),
        ...(bio !== undefined && { bio }),
        ...(preferences !== undefined && { preferences }),
      },
      create: {
        address,
        displayName,
        bio,
        preferences: preferences || {},
      },
    });

    cache.del(`users:profile:${address}`);
    res.json(updatedProfile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const uploadAvatar = async (req, res) => {
  try {
    const { address } = req.params;
    if (!validateAddress(address, res)) return;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;

    const updatedProfile = await prisma.userProfile.upsert({
      where: { address },
      update: { avatarUrl },
      create: {
        address,
        avatarUrl,
      },
    });

    cache.del(`users:profile:${address}`);
    res.json(updatedProfile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { getUserProfile, getUserEscrows, getUserStats, updateUserProfile, uploadAvatar };
