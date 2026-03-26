/**
 * Reputation Controller
 *
 * Cache handled by route-level middleware — no manual cache calls here.
 */

import prisma from '../../lib/prisma.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

const getReputation = async (req, res) => {
  try {
    const { address } = req.params;
    if (!STELLAR_ADDRESS_RE.test(address)) {
      return res.status(400).json({ error: 'Invalid Stellar address' });
    }
    const record = await prisma.reputationRecord.findUnique({ where: { address } });
    res.json(record ?? {
      address, totalScore: 0, completedEscrows: 0,
      disputedEscrows: 0, disputesWon: 0, totalVolume: '0', lastUpdated: null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getLeaderboard = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const [records, total] = await prisma.$transaction([
      prisma.reputationRecord.findMany({
        orderBy: { totalScore: 'desc' }, skip, take: limit,
        select: { address: true, totalScore: true, completedEscrows: true, disputesWon: true, totalVolume: true },
      }),
      prisma.reputationRecord.count(),
    ]);
    const data = records.map((r, i) => ({
      rank: skip + i + 1,
      address: `${r.address.slice(0, 6)}...${r.address.slice(-4)}`,
      fullAddress: r.address,
      totalScore: r.totalScore,
      completedEscrows: r.completedEscrows,
      disputesWon: r.disputesWon,
      totalVolume: r.totalVolume,
    }));
    res.json(buildPaginatedResponse(data, { total, page, limit }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { getReputation, getLeaderboard };
