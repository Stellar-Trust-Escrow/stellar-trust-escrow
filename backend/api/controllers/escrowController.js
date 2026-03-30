/**
 * Escrow Controller
 *
 * Read endpoints (listEscrows, getEscrow, getMilestones, getMilestone) are
 * cached at the route level via cacheResponse middleware.
 *
 * Status-changing operations (releaseFunds, raiseDispute) invalidate the
 * relevant cache tags directly so stale data is never served.
 */

import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import {
  escrowIdParam,
  signedXdrBody,
  paginationQuery,
  handleValidationErrors,
} from '../../middleware/validation.js';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Invalidate all cache entries for a specific escrow and the list collection. */
async function invalidateEscrowCache(id) {
  await cache.invalidateTags(['escrows', `escrow:${id}`]);
  console.log(`[Cache] Invalidated escrow:${id} + escrows collection`);
}

/** Log cache hit/miss metrics to console for monitoring. */
function logCacheMetrics() {
  const m = cache.analytics();
  console.log(
    `[Cache] backend=${m.backend} hits=${m.hits} misses=${m.misses} ` +
    `hitRate=${m.hitRate} sets=${m.sets} invalidations=${m.invalidations}`,
  );
}

// ── Read handlers (cached at route level) ─────────────────────────────────────

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

    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (client) where.clientAddress = client;
    if (freelancer) where.freelancerAddress = freelancer;

    if (search) {
      const term = search.trim();
      const numericId = /^\d+$/.test(term) ? BigInt(term) : null;
      where.OR = [
        ...(numericId ? [{ id: numericId }] : []),
        { clientAddress: { contains: term, mode: 'insensitive' } },
        { freelancerAddress: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (minAmount) where.totalAmount = { ...where.totalAmount, gte: String(minAmount) };
    if (maxAmount) where.totalAmount = { ...where.totalAmount, lte: String(maxAmount) };

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const resolvedSortBy = VALID_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const resolvedSortOrder = VALID_SORT_ORDERS.includes(sortOrder) ? sortOrder : 'desc';
    const orderBy = { [resolvedSortBy]: resolvedSortOrder };

    const [data, total] = await prisma.$transaction([
      prisma.escrow.findMany({ where, select: ESCROW_SUMMARY_SELECT, skip, take: limit, orderBy }),
      prisma.escrow.count({ where }),
    ]);

    res.json(buildPaginatedResponse(data, { total, page, limit }));
  } catch (err) {
    logControllerError('escrow.listEscrows', err, req);
    res.status(500).json({ error: err.message });
  }
};

const getEscrow = async (req, res) => {
  try {
    const id = BigInt(req.params.id);

    const escrow = await prisma.escrow.findUnique({
      where: { id },
      include: {
        milestones: {
          orderBy: { milestoneIndex: 'asc' },
          select: {
            id: true, milestoneIndex: true, title: true,
            amount: true, status: true, submittedAt: true, resolvedAt: true,
          },
        },
        dispute: {
          select: {
            id: true, escrowId: true, raisedByAddress: true, raisedAt: true,
            resolvedAt: true, clientAmount: true, freelancerAmount: true,
            resolvedBy: true, resolution: true,
          },
        },
      },
    });

    if (!escrow) return res.status(404).json({ error: 'Escrow not found' });
    res.json(escrow);
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    logControllerError('escrow.getEscrow', err, req);
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
    logControllerError('escrow.broadcastCreateEscrow', err, req);
    res.status(500).json({ error: err.message });
  }
};

const getMilestones = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.id);
    const { page, limit, skip } = parsePagination(req.query);

    const [data, total] = await prisma.$transaction([
      prisma.milestone.findMany({
        where: { escrowId },
        skip,
        take: limit,
        orderBy: { milestoneIndex: 'asc' },
        select: {
          id: true, milestoneIndex: true, title: true,
          amount: true, status: true, submittedAt: true, resolvedAt: true,
        },
      }),
      prisma.milestone.count({ where: { escrowId } }),
    ]);

    res.json(buildPaginatedResponse(data, { total, page, limit }));
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }
    logControllerError('escrow.getMilestones', err, req);
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
        id: true, milestoneIndex: true, escrowId: true, title: true,
        amount: true, status: true, submittedAt: true, resolvedAt: true,
      },
    });

    if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
    res.json(milestone);
  } catch (err) {
    logControllerError('escrow.getMilestone', err, req);
    res.status(500).json({ error: err.message });
  }
};

export default { listEscrows, getEscrow, broadcastCreateEscrow, getMilestones, getMilestone };

// ── Validation rule sets (used by escrowRoutes) ───────────────────────────────
export const validateBroadcast = [signedXdrBody, handleValidationErrors];
export const validateEscrowId = [escrowIdParam, handleValidationErrors];
export const validatePagination = [...paginationQuery, handleValidationErrors];
