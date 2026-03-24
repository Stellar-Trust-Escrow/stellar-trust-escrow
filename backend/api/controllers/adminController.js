/**
 * Admin Controller
 *
 * Handles all admin-only operations: user management, dispute resolution,
 * platform statistics, fee management, and audit logs.
 *
 * @module controllers/adminController
 */

import { PrismaClient } from '@prisma/client';
import { ValidationError, NotFoundError, ConflictError } from '../../lib/errors.js';
import asyncHandler from '../../lib/asyncHandler.js';

const prisma = new PrismaClient();

// ── Users ──────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/users
 * Returns a paginated list of all users (reputation records).
 */
const listUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, search = '' } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = search ? { address: { contains: search, mode: 'insensitive' } } : {};

  const [users, total] = await Promise.all([
    prisma.reputationRecord.findMany({
      where,
      skip,
      take: parseInt(limit),
      orderBy: { totalScore: 'desc' },
    }),
    prisma.reputationRecord.count({ where }),
  ]);

  res.json({
    users,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * GET /api/admin/users/:address
 * Returns a detailed profile for a specific user.
 */
const getUserDetail = asyncHandler(async (req, res) => {
  const { address } = req.params;

  const [reputation, escrowsAsClient, escrowsAsFreelancer] = await Promise.all([
    prisma.reputationRecord.findUnique({ where: { address } }),
    prisma.escrow.count({ where: { clientAddress: address } }),
    prisma.escrow.count({ where: { freelancerAddress: address } }),
  ]);

  if (!reputation) {
    throw new NotFoundError('User not found.');
  }

  res.json({
    address,
    reputation,
    stats: { escrowsAsClient, escrowsAsFreelancer },
  });
});

/**
 * POST /api/admin/users/:address/suspend
 * Suspends a user (sets a suspension flag in the audit log — placeholder).
 */
const suspendUser = asyncHandler(async (req, res) => {
  const { address } = req.params;
  const { reason = 'No reason provided' } = req.body;

  const user = await prisma.reputationRecord.findUnique({ where: { address } });
  if (!user) {
    throw new NotFoundError('User not found.');
  }

  const auditEntry = await prisma.adminAuditLog.create({
    data: {
      action: 'SUSPEND_USER',
      targetAddress: address,
      reason,
      performedBy: 'admin',
      performedAt: new Date(),
    },
  });

  res.json({
    message: `User ${address} suspended.`,
    auditEntry,
  });
});

/**
 * POST /api/admin/users/:address/ban
 * Permanently bans a user.
 */
const banUser = asyncHandler(async (req, res) => {
  const { address } = req.params;
  const { reason = 'No reason provided' } = req.body;

  const user = await prisma.reputationRecord.findUnique({ where: { address } });
  if (!user) {
    throw new NotFoundError('User not found.');
  }

  const auditEntry = await prisma.adminAuditLog.create({
    data: {
      action: 'BAN_USER',
      targetAddress: address,
      reason,
      performedBy: 'admin',
      performedAt: new Date(),
    },
  });

  res.json({
    message: `User ${address} banned.`,
    auditEntry,
  });
});

// ── Disputes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/disputes
 * Returns a paginated list of all disputes.
 */
const listDisputes = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, resolved } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where =
    resolved === 'true'
      ? { resolvedAt: { not: null } }
      : resolved === 'false'
        ? { resolvedAt: null }
        : {};

  const [disputes, total] = await Promise.all([
    prisma.dispute.findMany({
      where,
      skip,
      take: parseInt(limit),
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

  res.json({
    disputes,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

/**
 * POST /api/admin/disputes/:id/resolve
 * Resolves an open dispute by recording the admin's decision.
 *
 * Body: { clientAmount: string, freelancerAmount: string, notes: string }
 */
const resolveDispute = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { clientAmount, freelancerAmount, notes = '' } = req.body;

  if (clientAmount === undefined || freelancerAmount === undefined) {
    throw new ValidationError('clientAmount and freelancerAmount are required.');
  }

  const dispute = await prisma.dispute.findUnique({
    where: { id: parseInt(id) },
  });

  if (!dispute) {
    throw new NotFoundError('Dispute not found.');
  }

  if (dispute.resolvedAt) {
    throw new ConflictError('Dispute already resolved.');
  }

  const updated = await prisma.dispute.update({
    where: { id: parseInt(id) },
    data: {
      resolvedAt: new Date(),
      clientAmount: String(clientAmount),
      freelancerAmount: String(freelancerAmount),
      resolvedBy: 'admin',
    },
  });

  await prisma.adminAuditLog.create({
    data: {
      action: 'RESOLVE_DISPUTE',
      targetAddress: dispute.escrowId.toString(),
      reason: notes,
      performedBy: 'admin',
      performedAt: new Date(),
    },
  });

  res.json({ message: 'Dispute resolved.', dispute: updated });
});

// ── Platform Statistics ────────────────────────────────────────────────────────

/**
 * GET /api/admin/stats
 * Returns aggregated platform statistics.
 */
const getStats = asyncHandler(async (_req, res) => {
  const [
    totalEscrows,
    activeEscrows,
    completedEscrows,
    disputedEscrows,
    totalUsers,
    openDisputes,
  ] = await Promise.all([
    prisma.escrow.count(),
    prisma.escrow.count({ where: { status: 'Active' } }),
    prisma.escrow.count({ where: { status: 'Completed' } }),
    prisma.escrow.count({ where: { status: 'Disputed' } }),
    prisma.reputationRecord.count(),
    prisma.dispute.count({ where: { resolvedAt: null } }),
  ]);

  res.json({
    escrows: {
      total: totalEscrows,
      active: activeEscrows,
      completed: completedEscrows,
      disputed: disputedEscrows,
    },
    users: { total: totalUsers },
    disputes: { open: openDisputes, resolved: disputedEscrows - openDisputes },
  });
});

// ── Audit Logs ─────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/audit-logs
 * Returns a paginated audit log of all admin actions.
 */
const getAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [logs, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      skip,
      take: parseInt(limit),
      orderBy: { performedAt: 'desc' },
    }),
    prisma.adminAuditLog.count(),
  ]);

  res.json({
    logs,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// ── Fee Management ─────────────────────────────────────────────────────────────

/**
 * GET /api/admin/settings
 * Returns platform settings (fee, etc.) from env/config.
 */
const getSettings = asyncHandler(async (_req, res) => {
  res.json({
    platformFeePercent: process.env.PLATFORM_FEE_PERCENT || '1.5',
    stellarNetwork: process.env.STELLAR_NETWORK || 'testnet',
    allowedOrigins: process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
  });
});

/**
 * PATCH /api/admin/settings
 * Updates platform settings.
 */
const updateSettings = asyncHandler(async (req, res) => {
  const { platformFeePercent } = req.body;

  if (platformFeePercent !== undefined) {
    const fee = parseFloat(platformFeePercent);
    if (isNaN(fee) || fee < 0 || fee > 100) {
      throw new ValidationError('platformFeePercent must be a number between 0 and 100.');
    }
  }

  // TODO: Persist to DB
  res.json({
    message: 'Settings updated (note: changes are not persisted until DB support is added).',
    received: req.body,
  });
});

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
};
