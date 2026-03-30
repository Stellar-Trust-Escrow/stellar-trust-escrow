/**
 * Admin Controller
 *
 * Handles all admin-only operations: user management, dispute resolution,
 * platform statistics, fee management, and audit logs.
 *
 * @module controllers/adminController
 */

import prisma from '../../lib/prisma.js';
import { TIER_LIMITS } from '../../config/rateLimits.js';
import { getUserUsage } from '../middleware/rateLimiter.js';

// Mutable runtime overrides (resets on server restart)
const runtimeTierLimits = { ...TIER_LIMITS };

const getRateLimits = (_req, res) => {
  res.json({ tiers: runtimeTierLimits });
};

const updateRateLimit = (req, res) => {
  const { tier } = req.params;
  const { max } = req.body;
  if (!(tier in runtimeTierLimits)) {
    return res.status(404).json({ error: `Unknown tier: ${tier}` });
  }
  const parsed = parseInt(max, 10);
  if (isNaN(parsed) || parsed < 1) {
    return res.status(400).json({ error: 'max must be a positive integer' });
  }
  runtimeTierLimits[tier] = parsed;
  res.json({ tier, max: parsed });
};

const getUserRateLimitUsage = (req, res) => {
  const { userId } = req.params;
  const usage = getUserUsage(userId);
  res.json({ userId, ...usage });
};
import cache from '../../lib/cache.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';

// ── Users ──────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/users
 * Returns a paginated list of all users (reputation records).
 */
const listUsers = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { search = '' } = req.query;

    const where = search ? { address: { contains: search, mode: 'insensitive' } } : {};

    const cacheKey = `admin:users:${JSON.stringify({ where, page, limit })}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [users, total] = await prisma.$transaction([
      prisma.reputationRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { totalScore: 'desc' },
        select: {
          address: true,
          totalScore: true,
          completedEscrows: true,
          disputedEscrows: true,
          disputesWon: true,
          totalVolume: true,
          lastUpdated: true,
        },
      }),
      prisma.reputationRecord.count({ where }),
    ]);

    const result = buildPaginatedResponse(users, { total, page, limit });
    await cache.set(cacheKey, result, 30);
    res.json(result);
  } catch (err) {
    logControllerError('admin.listUsers', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/admin/users/:address
 * Returns a detailed profile for a specific user.
 */
const getUserDetail = async (req, res) => {
  try {
    const { address } = req.params;

    const cacheKey = `admin:user:${address}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Use two targeted queries instead of OR — leverages composite indexes
    const [reputation, escrowsAsClient, escrowsAsFreelancer] = await Promise.all([
      prisma.reputationRecord.findUnique({ where: { address } }),
      prisma.escrow.count({ where: { clientAddress: address } }),
      prisma.escrow.count({ where: { freelancerAddress: address } }),
    ]);

    if (!reputation) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const result = {
      address,
      reputation,
      stats: { escrowsAsClient, escrowsAsFreelancer },
    };

    await cache.set(cacheKey, result, 60);
    res.json(result);
  } catch (err) {
    logControllerError('admin.getUserDetail', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/admin/users/:address/suspend
 * Suspends a user (sets a suspension flag in the audit log — placeholder).
 */
const suspendUser = async (req, res) => {
  try {
    const { address } = req.params;
    const { reason = 'No reason provided' } = req.body;

    // Use a transaction to atomically verify user existence and log the action
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.reputationRecord.findUnique({
        where: { address },
        select: { address: true },
      });
      if (!user) return null;

      const auditEntry = await tx.adminAuditLog.create({
        data: {
          action: 'SUSPEND_USER',
          targetAddress: address,
          reason,
          performedBy: 'admin',
          performedAt: new Date(),
        },
      });

      return auditEntry;
    });

    if (!result) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await cache.invalidatePrefix(`admin:user:${address}`);
    res.json({ message: `User ${address} suspended.`, auditEntry: result });
  } catch (err) {
    logControllerError('admin.suspendUser', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/admin/users/:address/ban
 * Permanently bans a user.
 */
const banUser = async (req, res) => {
  try {
    const { address } = req.params;
    const { reason = 'No reason provided' } = req.body;

    // Use a transaction to atomically verify user existence and log the action
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.reputationRecord.findUnique({
        where: { address },
        select: { address: true },
      });
      if (!user) return null;

      const auditEntry = await tx.adminAuditLog.create({
        data: {
          action: 'BAN_USER',
          targetAddress: address,
          reason,
          performedBy: 'admin',
          performedAt: new Date(),
        },
      });

      return auditEntry;
    });

    if (!result) {
      return res.status(404).json({ error: 'User not found.' });
    }

    await cache.invalidatePrefix(`admin:user:${address}`);
    res.json({ message: `User ${address} banned.`, auditEntry: result });
  } catch (err) {
    logControllerError('admin.banUser', err, req);
    res.status(500).json({ error: err.message });
  }
};

// ── Disputes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/disputes
 * Returns a paginated list of all disputes.
 */
const listDisputes = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { resolved } = req.query;

    const where =
      resolved === 'true'
        ? { resolvedAt: { not: null } }
        : resolved === 'false'
          ? { resolvedAt: null }
          : {};

    const cacheKey = `admin:disputes:${JSON.stringify({ where, page, limit })}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [disputes, total] = await prisma.$transaction([
      prisma.dispute.findMany({
        where,
        skip,
        take: limit,
        orderBy: { raisedAt: 'desc' },
        include: {
          escrow: {
            select: {
              clientAddress: true,
              freelancerAddress: true,
              totalAmount: true,
              status: true,
            },
          },
        },
      }),
      prisma.dispute.count({ where }),
    ]);

    const result = buildPaginatedResponse(disputes, { total, page, limit });
    await cache.set(cacheKey, result, 15);
    res.json(result);
  } catch (err) {
    logControllerError('admin.listDisputes', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/admin/disputes/:id/resolve
 * Resolves an open dispute by recording the admin's decision.
 *
 * Body: { clientAmount: string, freelancerAmount: string, notes: string }
 */
const resolveDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const { clientAmount, freelancerAmount, notes = '' } = req.body;
    const tenantId = req.tenant?.id;

    if (clientAmount === undefined || freelancerAmount === undefined) {
      return res.status(400).json({ error: 'clientAmount and freelancerAmount are required.' });
    }

    const disputeId = parseInt(id);

    // Single transaction: read → validate → update → audit log
    const result = await prisma.$transaction(async (tx) => {
      const dispute = await tx.dispute.findFirst({
        where: { id: disputeId, ...(tenantId ? { tenantId } : {}) },
        select: { id: true, escrowId: true, resolvedAt: true },
      });

      if (!dispute) return { error: 'Dispute not found.', status: 404 };
      if (dispute.resolvedAt) return { error: 'Dispute already resolved.', status: 409 };

      await Promise.all([
        tx.dispute.updateMany({
          where: { id: disputeId, ...(tenantId ? { tenantId } : {}) },
          data: {
            resolvedAt: new Date(),
            clientAmount: String(clientAmount),
            freelancerAmount: String(freelancerAmount),
            resolvedBy: 'admin',
          },
        }),
        tx.adminAuditLog.create({
          data: {
            action: 'RESOLVE_DISPUTE',
            targetAddress: dispute.escrowId.toString(),
            reason: notes,
            performedBy: 'admin',
            performedAt: new Date(),
          },
        }),
      ]);

      const updated = await tx.dispute.findFirst({
        where: { id: disputeId, ...(tenantId ? { tenantId } : {}) },
      });

      return { dispute: updated };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    await cache.invalidateTags(['escrows', `escrow:${result.dispute.escrowId}`]);
    await cache.invalidatePrefix('admin:disputes');
    res.json({ message: 'Dispute resolved.', dispute: result.dispute });
  } catch (err) {
    logControllerError('admin.resolveDispute', err, req);
    res.status(500).json({ error: err.message });
  }
};

// ── Platform Statistics ────────────────────────────────────────────────────────

/**
 * GET /api/admin/stats
 * Returns aggregated platform statistics.
 * Optimized: uses groupBy to get all escrow status counts in one query
 * instead of 4 separate COUNT queries.
 */
const getStats = async (req, res) => {
  try {
    const cacheKey = 'admin:stats';
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    // 3 queries instead of 6: groupBy replaces 4 separate escrow counts
    const [escrowStatusCounts, totalUsers, openDisputes] = await Promise.all([
      prisma.escrow.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      prisma.reputationRecord.count(),
      prisma.dispute.count({ where: { resolvedAt: null } }),
    ]);

    const countsByStatus = Object.fromEntries(
      escrowStatusCounts.map((r) => [r.status, r._count.id]),
    );

    const totalEscrows = escrowStatusCounts.reduce((sum, r) => sum + r._count.id, 0);

    const result = {
      escrows: {
        total: totalEscrows,
        active: countsByStatus.Active ?? 0,
        completed: countsByStatus.Completed ?? 0,
        disputed: countsByStatus.Disputed ?? 0,
      },
      users: { total: totalUsers },
      disputes: {
        open: openDisputes,
        resolved: (countsByStatus.Disputed ?? 0) - openDisputes,
      },
    };

    await cache.set(cacheKey, result, 30);
    res.json(result);
  } catch (err) {
    logControllerError('admin.getStats', err, req);
    res.status(500).json({ error: err.message });
  }
};

// ── Audit Logs ─────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/audit-logs
 * Returns a paginated audit log of all admin actions.
 */
const getAuditLogs = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const cacheKey = `admin:audit-logs:${page}:${limit}`;
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [logs, total] = await prisma.$transaction([
      prisma.adminAuditLog.findMany({
        skip,
        take: limit,
        orderBy: { performedAt: 'desc' },
      }),
      prisma.adminAuditLog.count(),
    ]);

    const result = buildPaginatedResponse(logs, { total, page, limit });
    await cache.set(cacheKey, result, 15);
    res.json(result);
  } catch (err) {
    logControllerError('admin.getAuditLogs', err, req);
    res.status(500).json({ error: err.message });
  }
};

// ── Fee Management ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/settings
 * Returns platform settings (fee, etc.) from env/config.
 *
 * TODO (Issue #23): Persist settings to DB for dynamic configuration.
 */
const getSettings = async (req, res) => {
  try {
    res.json({
      platformFeePercent: process.env.PLATFORM_FEE_PERCENT || '1.5',
      stellarNetwork: process.env.STELLAR_NETWORK || 'testnet',
      allowedOrigins: process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
    });
  } catch (err) {
    logControllerError('admin.getSettings', err, req);
    res.status(500).json({ error: err.message });
  }
};

/**
 * PATCH /api/admin/settings
 * Updates platform settings.
 *
 * TODO (Issue #23): Persist to DB. Currently only validates input.
 */
const updateSettings = async (req, res) => {
  try {
    const { platformFeePercent } = req.body;

    if (platformFeePercent !== undefined) {
      const fee = parseFloat(platformFeePercent);
      if (isNaN(fee) || fee < 0 || fee > 100) {
        return res
          .status(400)
          .json({ error: 'platformFeePercent must be a number between 0 and 100.' });
      }
    }

    // TODO: Persist to DB
    res.json({
      message: 'Settings updated (note: changes are not persisted until DB support is added).',
      received: req.body,
    });
  } catch (err) {
    logControllerError('admin.updateSettings', err, req);
    res.status(500).json({ error: err.message });
  }
};

export default {
  listUsers,
  getUserDetail,
  suspendUser,
  banUser,
  listDisputes,
  resolveDispute,
  getStats,
  getAuditLogs,
  getSettings,
  updateSettings,
  getRateLimits,
  updateRateLimit,
  getUserRateLimitUsage,
};
