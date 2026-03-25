import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';

const ESCROW_SUMMARY_SELECT = {
  id: true,
  clientAddress: true,
  freelancerAddress: true,
  status: true,
  totalAmount: true,
  remainingBalance: true,
  deadline: true,
  createdAt: true,
};

const VALID_SORT_FIELDS = ['createdAt', 'totalAmount', 'status'];
const VALID_SORT_ORDERS = ['asc', 'desc'];

const listEscrows = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const {
      status,
      client,
      freelancer,
      search,
      minAmount,
      maxAmount,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const where = {};

    // Status filter — supports comma-separated values e.g. status=Active,Completed
    if (status) {
      const statuses = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }

    if (client) where.clientAddress = client;
    if (freelancer) where.freelancerAddress = freelancer;

    // Search by escrow ID or address (client/freelancer)
    if (search) {
      const term = search.trim();
      const numericId = /^\d+$/.test(term) ? BigInt(term) : null;
      where.OR = [
        ...(numericId ? [{ id: numericId }] : []),
        { clientAddress: { contains: term, mode: 'insensitive' } },
        { freelancerAddress: { contains: term, mode: 'insensitive' } },
      ];
    }

    // Amount range (stored as string — cast via raw or compare lexicographically)
    // We store amounts as numeric strings so we use gte/lte on the string field
    // For proper numeric comparison we rely on the caller sending values in the same unit
    if (minAmount) where.totalAmount = { ...where.totalAmount, gte: String(minAmount) };
    if (maxAmount) where.totalAmount = { ...where.totalAmount, lte: String(maxAmount) };

    // Date range on createdAt
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // Sorting — whitelist to prevent injection
    const resolvedSortBy = VALID_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const resolvedSortOrder = VALID_SORT_ORDERS.includes(sortOrder) ? sortOrder : 'desc';
    const orderBy = { [resolvedSortBy]: resolvedSortOrder };

    const cacheKey = `escrows:list:${JSON.stringify(
      { where, page, limit, orderBy },
      (key, value) => (typeof value === 'bigint' ? value.toString() : value),
    )}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [data, total] = await prisma.$transaction([
      prisma.escrow.findMany({ where, select: ESCROW_SUMMARY_SELECT, skip, take: limit, orderBy }),
      prisma.escrow.count({ where }),
    ]);

    const result = buildPaginatedResponse(data, { total, page, limit });
    cache.set(cacheKey, result, 15);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getEscrow = async (req, res) => {
  try {
    const id = BigInt(req.params.id);
    const cacheKey = `escrows:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const escrow = await prisma.escrow.findUnique({
      where: { id },
      include: {
        milestones: {
          orderBy: { milestoneIndex: 'asc' },
          select: {
            id: true,
            milestoneIndex: true,
            title: true,
            amount: true,
            status: true,
            submittedAt: true,
            resolvedAt: true,
          },
        },
        dispute: {
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
          },
        },
      },
    });

    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

    cache.set(cacheKey, escrow, 30);
    res.json(escrow);
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    res.status(500).json({ error: err.message });
  }
};

const broadcastCreateEscrow = async (req, res) => {
  try {
    const { signedXdr } = req.body;
    if (!signedXdr || typeof signedXdr !== 'string') {
      return res.status(400).json({ error: 'signedXdr is required' });
    }

    res.status(501).json({ error: 'Not implemented - see Issue #20' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMilestones = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.id);
    const { page, limit, skip } = parsePagination(req.query);
    const cacheKey = `escrows:${escrowId}:milestones:${page}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [data, total] = await prisma.$transaction([
      prisma.milestone.findMany({
        where: { escrowId },
        skip,
        take: limit,
        orderBy: { milestoneIndex: 'asc' },
        select: {
          id: true,
          milestoneIndex: true,
          title: true,
          amount: true,
          status: true,
          submittedAt: true,
          resolvedAt: true,
        },
      }),
      prisma.milestone.count({ where: { escrowId } }),
    ]);

    const result = buildPaginatedResponse(data, { total, page, limit });
    cache.set(cacheKey, result, 30);
    res.json(result);
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    res.status(500).json({ error: err.message });
  }
};

const getMilestone = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.id);
    const milestoneIndex = parseInt(req.params.milestoneId, 10);

    const milestone = await prisma.milestone.findUnique({
      where: { escrowId_milestoneIndex: { escrowId, milestoneIndex } },
      select: {
        id: true,
        milestoneIndex: true,
        escrowId: true,
        title: true,
        amount: true,
        status: true,
        submittedAt: true,
        resolvedAt: true,
      },
    });

    if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
    res.json(milestone);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { listEscrows, getEscrow, broadcastCreateEscrow, getMilestones, getMilestone };
