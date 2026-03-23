import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

const LEADERBOARD_TTL = 300;
const REPUTATION_TTL = 60;

const getReputation = async (req, res) => {
  try {
    const { address } = req.params;
    if (!STELLAR_ADDRESS_RE.test(address)) {
      return res.status(400).json({ error: 'Invalid Stellar address' });
    }

    const cacheKey = `reputation:${address}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const record = await prisma.reputationRecord.findUnique({ where: { address } });

    const result = record ?? {
      address,
      totalScore: 0,
      completedEscrows: 0,
      disputedEscrows: 0,
      disputesWon: 0,
      totalVolume: '0',
      lastUpdated: null,
    };

    cache.set(cacheKey, result, REPUTATION_TTL);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getLeaderboard = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const cacheKey = `reputation:leaderboard:${page}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [records, total] = await prisma.$transaction([
      prisma.reputationRecord.findMany({
        orderBy: { totalScore: 'desc' },
        skip,
        take: limit,
        select: {
          address: true,
          totalScore: true,
          completedEscrows: true,
          disputesWon: true,
          totalVolume: true,
        },
      }),
      prisma.reputationRecord.count(),
    ]);

    const data = records.map((record, index) => ({
      rank: skip + index + 1,
      address: `${record.address.slice(0, 6)}...${record.address.slice(-4)}`,
      fullAddress: record.address,
      totalScore: record.totalScore,
      completedEscrows: record.completedEscrows,
      disputesWon: record.disputesWon,
      totalVolume: record.totalVolume,
    }));

    const result = buildPaginatedResponse(data, { total, page, limit });
    cache.set(cacheKey, result, LEADERBOARD_TTL);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { getReputation, getLeaderboard };
