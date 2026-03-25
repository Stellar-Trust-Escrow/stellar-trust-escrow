/**
 * Audit Service
 *
 * Central service for writing and querying the immutable AuditLog table.
 * Records are append-only — no update or delete operations are exposed.
 *
 * @module services/auditService
 */

import { stringify } from 'csv-stringify/sync';
import prisma from '../lib/prisma.js';

// ── Categories & Actions ──────────────────────────────────────────────────────

export const AuditCategory = {
  AUTH: 'AUTH',
  ESCROW: 'ESCROW',
  MILESTONE: 'MILESTONE',
  DISPUTE: 'DISPUTE',
  ADMIN: 'ADMIN',
  PAYMENT: 'PAYMENT',
  KYC: 'KYC',
};

export const AuditAction = {
  // Auth
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  AUTH_FAILED: 'AUTH_FAILED',
  // Escrow
  CREATE_ESCROW: 'CREATE_ESCROW',
  CANCEL_ESCROW: 'CANCEL_ESCROW',
  COMPLETE_ESCROW: 'COMPLETE_ESCROW',
  // Milestone
  ADD_MILESTONE: 'ADD_MILESTONE',
  SUBMIT_MILESTONE: 'SUBMIT_MILESTONE',
  APPROVE_MILESTONE: 'APPROVE_MILESTONE',
  REJECT_MILESTONE: 'REJECT_MILESTONE',
  // Dispute
  RAISE_DISPUTE: 'RAISE_DISPUTE',
  RESOLVE_DISPUTE: 'RESOLVE_DISPUTE',
  // Admin
  SUSPEND_USER: 'SUSPEND_USER',
  BAN_USER: 'BAN_USER',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  // Payment
  PAYMENT_INITIATED: 'PAYMENT_INITIATED',
  PAYMENT_COMPLETED: 'PAYMENT_COMPLETED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_REFUNDED: 'PAYMENT_REFUNDED',
  // KYC
  KYC_SUBMITTED: 'KYC_SUBMITTED',
  KYC_APPROVED: 'KYC_APPROVED',
  KYC_DECLINED: 'KYC_DECLINED',
};

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Append a new audit record. Never throws — failures are logged to stderr
 * so that a logging error never breaks the main request flow.
 *
 * @param {object} entry
 * @param {string} entry.category  - AuditCategory value
 * @param {string} entry.action    - AuditAction value
 * @param {string} entry.actor     - Stellar address, "admin", or "system"
 * @param {string} [entry.resourceId]
 * @param {object} [entry.metadata]
 * @param {number} [entry.statusCode]
 * @param {string} [entry.ipAddress]
 */
export async function log(entry) {
  try {
    await prisma.auditLog.create({
      data: {
        category: entry.category,
        action: entry.action,
        actor: entry.actor,
        resourceId: entry.resourceId ?? null,
        metadata: entry.metadata ?? undefined,
        statusCode: entry.statusCode ?? null,
        ipAddress: entry.ipAddress ?? null,
      },
    });
  } catch (err) {
    console.error('[AuditService] Failed to write audit log:', err.message);
  }
}

// ── Shared filter builder ─────────────────────────────────────────────────────

/**
 * Builds a Prisma `where` clause from the standard audit log filter shape.
 * Reused by search() and exportCsv() to avoid logic drift.
 */
function buildWhereClause({ category, action, actor, resourceId, from, to } = {}) {
  const where = {};
  if (category) where.category = category;
  if (action) where.action = action;
  if (actor) where.actor = { contains: actor, mode: 'insensitive' };
  if (resourceId) where.resourceId = { contains: resourceId, mode: 'insensitive' };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  return where;
}

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * Search audit logs with optional filters and pagination.
 *
 * @param {object} filters
 * @param {string}  [filters.category]
 * @param {string}  [filters.action]
 * @param {string}  [filters.actor]
 * @param {string}  [filters.resourceId]
 * @param {string}  [filters.from]   - ISO date string
 * @param {string}  [filters.to]     - ISO date string
 * @param {number}  [filters.page=1]
 * @param {number}  [filters.limit=50]
 * @returns {{ data: AuditLog[], total: number, page: number, limit: number, pages: number }}
 */
export async function search(filters = {}) {
  const page = Math.max(1, parseInt(filters.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(filters.limit) || 50));
  const skip = (page - 1) * limit;

  const where = buildWhereClause(filters);

  const [data, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { data, total, page, limit, pages: Math.ceil(total / limit) };
}

// ── Export ────────────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  'id',
  'category',
  'action',
  'actor',
  'resourceId',
  'statusCode',
  'ipAddress',
  'createdAt',
];

/**
 * Export audit logs matching the given filters as a CSV string.
 * Capped at 10 000 rows to prevent memory exhaustion.
 *
 * @param {object} filters - same shape as search() filters (page/limit ignored)
 * @returns {string} CSV content
 */
export async function exportCsv(filters = {}) {
  const where = buildWhereClause(filters);

  const rows = await prisma.auditLog.findMany({
    where,
    take: 10_000,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      category: true,
      action: true,
      actor: true,
      resourceId: true,
      statusCode: true,
      ipAddress: true,
      createdAt: true,
    },
  });

  return stringify(rows, { header: true, columns: CSV_COLUMNS });
}

// ── Retention ─────────────────────────────────────────────────────────────────

/**
 * Delete audit records older than `retentionDays` days.
 * Intended to be called by a scheduled job (e.g. cron).
 *
 * @param {number} retentionDays
 * @returns {number} count of deleted records
 */
export async function purgeOldRecords(retentionDays) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const { count } = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return count;
}

export default { log, search, exportCsv, purgeOldRecords, AuditCategory, AuditAction };
