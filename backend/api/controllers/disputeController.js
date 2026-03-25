import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';

const listDisputes = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { resolved } = req.query;

    const where = {};
    if (resolved === 'true') where.resolvedAt = { not: null };
    else if (resolved === 'false') where.resolvedAt = null;

    const cacheKey = `disputes:list:${resolved ?? 'all'}:${page}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [data, total] = await prisma.$transaction([
      prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        orderBy: { raisedAt: 'desc' },
        select: {
          id: true,
          escrowId: true,
          raisedByAddress: true,
          raisedAt: true,
          resolvedAt: true,
          resolution: true,
          escrow: {
            select: {
              clientAddress: true,
              freelancerAddress: true,
              arbiterAddress: true,
              totalAmount: true,
              status: true,
            },
          },
        },
      }),
      prisma.dispute.count({ where }),
    ]);

    const result = buildPaginatedResponse(data, { total, page, limit });
    cache.set(cacheKey, result, 30);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getDispute = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.escrowId);
    const cacheKey = `disputes:${escrowId}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const dispute = await prisma.dispute.findUnique({
      where: { escrowId },
      select: {
        id: true,
        escrowId: true,
        raisedByAddress: true,
        raisedAt: true,
        resolvedAt: true,
        clientAmount: true,
        freelancerAmount: true,
        resolvedBy: true,
        resolution: true,
        escrow: {
          select: {
            clientAddress: true,
            freelancerAddress: true,
            arbiterAddress: true,
            totalAmount: true,
            status: true,
          },
        },
      },
    });

    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    cache.set(cacheKey, dispute, 60);
    res.json(dispute);
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    res.status(500).json({ error: err.message });
  }
};

export default { listDisputes, getDispute };
