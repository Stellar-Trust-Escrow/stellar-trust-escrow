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
import { logControllerError, getLogger } from '../../config/logger.js';
import { getUserUsage } from '../middleware/rateLimiter.js';

const adminLog = getLogger();

// JSON.stringify does not guarantee key order, so two objects with the same
// contents but different insertion order produce different cache keys.
// This sorted replacer ensures deterministic serialisation for cache keys.
function stableStringify(obj) {
  return JSON.stringify(obj, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );
}

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
  const previous = runtimeTierLimits[tier];
  runtimeTierLimits[tier] = parsed;

  adminLog.warn({
    type: 'admin_action',
    action: 'UPDATE_RATE_LIMIT',
    tier,
    previous,
    updated: parsed,
    performedBy: req.user?.address ?? 'unknown',
    requestId: req.id,
  });

  res.json({ tier, max: parsed });
};

const getUserRateLimitUsage = (req, res) => {
  const { userId } = req.params;
  const usage = getUserUsage(userId);
  res.json({ userId, ...usage });
};

import cache from '../../lib/cache.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import keyRotationService from '../../services/keyRotationService.js';

/** Deterministic JSON serialiser — sorts object keys recursively. */
function stableStringify(val) {
  if (Array.isArray(val)) return `[${val.map(stableStringify).join(',')}]`;
  if (val !== null && typeof val === 'object') {
    const pairs = Object.keys(val)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(val[k])}`);
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(val);
}

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

    const cacheKey = `admin:users:${stableStringify({ limit, page, where })}`;
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

    const cacheKey = `admin:disputes:${stableStringify({ limit, page, where })}`;
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
// ── Key Management ─────────────────────────────────────────────────────────────

const rotateKeys = async (req, res) => {
  try {
    const newKey = await keyRotationService.rotateKey();
    
    // Log action
    await prisma.adminAuditLog.create({
      data: {
        action: 'KEY_ROTATED',
        targetAddress: 'system',
        reason: 'Manual rotation triggered',
        performedBy: req.user?.address || 'admin',
        performedAt: new Date(),
      },
    });

    res.json({ message: 'Key rotated successfully', kid: newKey.kid });
  } catch (err) {
    logControllerError('admin.rotateKeys', err, req);
    res.status(500).json({ error: err.message });
  }
};

const listKeys = async (req, res) => {
  try {
    const validKeys = await keyRotationService.getValidPublicKeys();
    
    // Omit any private keys if accidentally passed by service (though service shouldn't return them here)
    const sanitizedKeys = validKeys.map(k => ({
      kid: k.kid,
      algorithm: k.algorithm,
      publicKey: k.publicKey
    }));

    res.json({ keys: sanitizedKeys });
  } catch (err) {
    logControllerError('admin.listKeys', err, req);
    res.status(500).json({ error: err.message });
  }
};

// ── Metrics ───────────────────────────────────────────────────────────────────
const getMetrics = async (req, res) => {
  try {
    const cacheKey = 'admin:metrics';
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Fetch current period metrics
    const [
      currentActiveEscrows,
      currentTotalLockedXLM,
      currentDisputesThisWeek,
      currentPlatformFeesThisMonth,
      // Previous period metrics for deltas
      prevActiveEscrows,
      prevTotalLockedXLM,
      prevDisputesThisWeek,
      prevPlatformFeesThisMonth,
      // For average resolution time
      resolvedDisputesThisWeek,
    ] = await Promise.all([
      prisma.escrow.count({ where: { status: 'Active' } }),
      prisma.escrow.aggregate({
        where: { status: 'Active' },
        _sum: { totalAmount: true },
      }),
      prisma.dispute.count({ where: { raisedAt: { gte: oneWeekAgo } } }),
      prisma.payment.aggregate({
        where: { createdAt: { gte: oneMonthAgo }, type: 'PLATFORM_FEE' },
        _sum: { amount: true },
      }),
      prisma.escrow.count({ where: { status: 'Active', createdAt: { lte: twoWeeksAgo } } }),
      prisma.escrow.aggregate({
        where: { status: 'Active', createdAt: { lte: twoWeeksAgo } },
        _sum: { totalAmount: true },
      }),
      prisma.dispute.count({ where: { raisedAt: { gte: twoWeeksAgo, lt: oneWeekAgo } } }),
      prisma.payment.aggregate({
        where: { createdAt: { gte: twoMonthsAgo, lt: oneMonthAgo }, type: 'PLATFORM_FEE' },
        _sum: { amount: true },
      }),
      prisma.dispute.findMany({
        where: { resolvedAt: { gte: oneWeekAgo } },
        select: { raisedAt: true, resolvedAt: true },
      }),
    ]);

    // Calculate average resolution time
    let avgResolutionTime = 0;
    if (resolvedDisputesThisWeek.length > 0) {
      const totalResolutionMs = resolvedDisputesThisWeek.reduce((sum, d) => {
        return sum + (new Date(d.resolvedAt) - new Date(d.raisedAt));
      }, 0);
      avgResolutionTime = Math.round(totalResolutionMs / resolvedDisputesThisWeek.length / (1000 * 60 * 60)); // in hours
    }

    // Calculate deltas
    const calculateDelta = (current, previous) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    const currentLocked = currentTotalLockedXLM._sum.totalAmount ? parseFloat(currentTotalLockedXLM._sum.totalAmount) : 0;
    const prevLocked = prevTotalLockedXLM._sum.totalAmount ? parseFloat(prevTotalLockedXLM._sum.totalAmount) : 0;
    const currentFees = currentPlatformFeesThisMonth._sum.amount ? parseFloat(currentPlatformFeesThisMonth._sum.amount) : 0;
    const prevFees = prevPlatformFeesThisMonth._sum.amount ? parseFloat(prevPlatformFeesThisMonth._sum.amount) : 0;

    const result = {
      activeEscrows: currentActiveEscrows,
      activeEscrowsDelta: calculateDelta(currentActiveEscrows, prevActiveEscrows),
      totalLockedXLM: currentLocked.toFixed(2),
      totalLockedXLMDelta: calculateDelta(currentLocked, prevLocked),
      disputesThisWeek: currentDisputesThisWeek,
      disputesThisWeekDelta: calculateDelta(currentDisputesThisWeek, prevDisputesThisWeek),
      avgResolutionTime: avgResolutionTime,
      avgResolutionTimeDelta: 0, // Placeholder - need historical data
      platformFeesMonth: currentFees.toFixed(2),
      platformFeesMonthDelta: calculateDelta(currentFees, prevFees),
    };

    await cache.set(cacheKey, result, 30);
    res.json(result);
  } catch (err) {
    logControllerError('admin.getMetrics', err, req);
    res.status(500).json({ error: err.message });
  }
};

// ── Arbiters ──────────────────────────────────────────────────────────────────
const listArbiters = async (req, res) => {
  try {
    const cacheKey = 'admin:arbiters';
    const cached = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const arbiters = await prisma.reputationRecord.findMany({
      where: { isArbiter: true },
      select: {
        address: true,
        activeDisputes: true,
        totalResolved: true,
        disputesWon: true,
        createdAt: true,
      },
    });

    const formattedArbiters = arbiters.map((arb) => ({
      address: arb.address,
      activeDisputes: arb.activeDisputes,
      totalResolved: arb.totalResolved,
      winRate: arb.totalResolved > 0 ? Math.round((arb.disputesWon / arb.totalResolved) * 100) : 0,
      registeredAt: arb.createdAt,
    }));

    const result = { arbiters: formattedArbiters };
    await cache.set(cacheKey, result, 30);
    res.json(result);
  } catch (err) {
    logControllerError('admin.listArbiters', err, req);
    res.status(500).json({ error: err.message });
  }
};

const registerArbiter = async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({ error: 'Address is required.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.reputationRecord.findUnique({
        where: { address },
      });

      if (existing && existing.isArbiter) {
        return { error: 'Arbiter already registered.', status: 409 };
      }

      const arbiter = await tx.reputationRecord.upsert({
        where: { address },
        create: {
          address,
          isArbiter: true,
          totalScore: 0,
          completedEscrows: 0,
          disputedEscrows: 0,
          disputesWon: 0,
          totalResolved: 0,
          activeDisputes: 0,
        },
        update: {
          isArbiter: true,
        },
      });

      await tx.adminAuditLog.create({
        data: {
          action: 'REGISTER_ARBITER',
          targetAddress: address,
          performedBy: 'admin',
          performedAt: new Date(),
        },
      });

      return { arbiter };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    await cache.invalidatePrefix('admin:arbiters');
    res.json({ message: 'Arbiter registered.', arbiter: result.arbiter });
  } catch (err) {
    logControllerError('admin.registerArbiter', err, req);
    res.status(500).json({ error: err.message });
  }
};

const removeArbiter = async (req, res) => {
  try {
    const { address } = req.params;

    const result = await prisma.$transaction(async (tx) => {
      const arbiter = await tx.reputationRecord.findUnique({
        where: { address },
      });

      if (!arbiter || !arbiter.isArbiter) {
        return { error: 'Arbiter not found.', status: 404 };
      }

      await tx.reputationRecord.update({
        where: { address },
        data: { isArbiter: false },
      });

      await tx.adminAuditLog.create({
        data: {
          action: 'REMOVE_ARBITER',
          targetAddress: address,
          performedBy: 'admin',
          performedAt: new Date(),
        },
      });

      return {};
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    await cache.invalidatePrefix('admin:arbiters');
    res.json({ message: 'Arbiter removed.' });
  } catch (err) {
    logControllerError('admin.removeArbiter', err, req);
    res.status(500).json({ error: err.message });
  }
};

// ── Dispute Queue ─────────────────────────────────────────────────────────────
const getDisputeQueue = async (req, res) => {
  try {
    const { status, orderBy } = req.query;

    const where = status === 'open' ? { resolvedAt: null } : {};

    let orderByConfig = { raisedAt: 'desc' };
    if (orderBy === 'escalationRisk') {
      // For now, we'll handle the complex sorting in the controller
      // since Prisma doesn't support complex expressions in orderBy easily
      orderByConfig = {};
    }

    const disputes = await prisma.dispute.findMany({
      where,
    });

    // Format disputes with escalation risk data
    const formattedDisputes = disputes.map((d) => ({
      escrowId: d.escrowId,
      raisedAt: d.raisedAt,
      currentArbiter: d.currentArbiter,
      escalationCount: d.escalationCount || 0,
      autoEscalateAt: d.autoEscalateAt,
      escalationRisk: d.escalationCount || 0, // For sorting
    }));

    // Apply custom sorting if needed
    let sortedDisputes = formattedDisputes;
    if (orderBy === 'escalationRisk') {
      sortedDisputes = [...formattedDisputes].sort((a, b) => {
        // Sort by escalation count (higher first), then by time until escalation (sooner first)
        const countCompare = (b.escalationCount || 0) - (a.escalationCount || 0);
        if (countCompare !== 0) return countCompare;

        const aTime = a.autoEscalateAt ? new Date(a.autoEscalateAt).getTime() : Infinity;
        const bTime = b.autoEscalateAt ? new Date(b.autoEscalateAt).getTime() : Infinity;
        return aTime - bTime;
      });
    }

    const result = { disputes: sortedDisputes };
    res.json(result);
  } catch (err) {
    logControllerError('admin.getDisputeQueue', err, req);
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
  rotateKeys,
  listKeys,
  getMetrics,
  listArbiters,
  registerArbiter,
  removeArbiter,
  getDisputeQueue,
};
