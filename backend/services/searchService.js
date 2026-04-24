/**
 * Search service fallback implementation.
 *
 * This keeps `/api/search` functional even when external search engines are
 * unavailable by querying Prisma directly.
 */

const analytics = {
  totalSearches: 0,
  topQueries: new Map(),
  zeroResultQueries: new Map(),
};

function recordQuery(map, query) {
  if (!query) return;
  map.set(query, (map.get(query) || 0) + 1);
}

function mapTopEntries(map, limit = 10) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([query, count]) => ({ query, count }));
}

function buildWhere(filters) {
  const where = {};

  if (filters.status) {
    const statuses = String(filters.status)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (statuses.length === 1) where.status = statuses[0];
    if (statuses.length > 1) where.status = { in: statuses };
  }

  if (filters.client) where.clientAddress = filters.client;
  if (filters.freelancer) where.freelancerAddress = filters.freelancer;

  if (typeof filters.minAmount === 'number' && !Number.isNaN(filters.minAmount)) {
    where.totalAmount = { ...where.totalAmount, gte: String(filters.minAmount) };
  }
  if (typeof filters.maxAmount === 'number' && !Number.isNaN(filters.maxAmount)) {
    where.totalAmount = { ...where.totalAmount, lte: String(filters.maxAmount) };
  }

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {};
    if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const end = new Date(filters.dateTo);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }

  const q = filters.q?.trim();
  if (q) {
    const numericId = /^\d+$/.test(q) ? BigInt(q) : null;
    where.OR = [
      ...(numericId ? [{ id: numericId }] : []),
      { clientAddress: { contains: q, mode: 'insensitive' } },
      { freelancerAddress: { contains: q, mode: 'insensitive' } },
    ];
  }

  return where;
}

async function search(filters = {}) {
  analytics.totalSearches += 1;
  recordQuery(analytics.topQueries, filters.q?.trim());

  const prisma = (await import('../lib/prisma.js')).default;
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const skip = (page - 1) * limit;

  const where = buildWhere(filters);
  const orderBy = {
    [filters.sortBy || 'createdAt']: filters.sortOrder || 'desc',
  };

  const [data, total] = await prisma.$transaction([
    prisma.escrow.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      select: {
        id: true,
        clientAddress: true,
        freelancerAddress: true,
        status: true,
        totalAmount: true,
        createdAt: true,
      },
    }),
    prisma.escrow.count({ where }),
  ]);

  if (total === 0) recordQuery(analytics.zeroResultQueries, filters.q?.trim());

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    hasNextPage: skip + data.length < total,
    hasPreviousPage: page > 1,
  };
}

async function suggest(q, size = 5) {
  const query = String(q || '').trim();
  if (!query) return [];

  const prisma = (await import('../lib/prisma.js')).default;
  const cap = Math.min(20, Math.max(1, Number(size) || 5));

  const rows = await prisma.escrow.findMany({
    where: {
      OR: [
        { clientAddress: { contains: query, mode: 'insensitive' } },
        { freelancerAddress: { contains: query, mode: 'insensitive' } },
      ],
    },
    take: cap,
    select: { clientAddress: true, freelancerAddress: true },
  });

  const dedup = new Set();
  for (const row of rows) {
    if (row.clientAddress) dedup.add(row.clientAddress);
    if (row.freelancerAddress) dedup.add(row.freelancerAddress);
  }
  return [...dedup].slice(0, cap).map((text) => ({ text, score: 1 }));
}

function getAnalytics() {
  return {
    totalSearches: analytics.totalSearches,
    topQueries: mapTopEntries(analytics.topQueries),
    zeroResultQueries: mapTopEntries(analytics.zeroResultQueries),
  };
}

async function reindex(prismaClient) {
  const prisma = prismaClient || (await import('../lib/prisma.js')).default;
  const total = await prisma.escrow.count();
  return { indexed: total };
}

export default { search, suggest, getAnalytics, reindex };
