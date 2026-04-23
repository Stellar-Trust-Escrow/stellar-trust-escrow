/**
 * Prisma Client Singleton with Connection Pooling and Monitoring
 *
 * Reuses a single PrismaClient instance across the app to avoid
 * exhausting the DB connection pool on hot reloads.
 *
 * Connection pooling is configured via DATABASE_URL parameters:
 * - connection_limit: Maximum connections in pool (default: 10)
 * - pool_timeout: Timeout waiting for connection (0 = no timeout)
 * - connection_timeout: Timeout establishing connection (default: 60000ms)
 */

import { PrismaClient } from '@prisma/client';
import { attachConnectionMonitoring, startConnectionMonitoring } from './connectionMonitor.js';
import { attachRetryMiddleware } from './retryUtils.js';
import { DEFAULT_TENANT_ID, getCurrentTenantId, isTenantScopeBypassed } from './tenantContext.js';

const SLOW_QUERY_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '500', 10);

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development'
      ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
      : ['error'],
    errorFormat: 'minimal',
  });

if (process.env.NODE_ENV === 'development' && !globalForPrisma.prisma) {
  prisma.$on('query', (e) => {
    if (e.duration > SLOW_QUERY_MS) {
      console.warn(`[Prisma] Slow query (${e.duration}ms): ${e.query}`);
    }
  });
}

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

const TENANT_SCOPED_MODELS = new Set([
  'User',
  'Escrow',
  'Milestone',
  'ReputationRecord',
  'Dispute',
  'DisputeEvidence',
  'DisputeAppeal',
  'UserProfile',
  'ContractEvent',
  'Payment',
  'KycVerification',
  'AdminAuditLog',
  'AuditLog',
]);

function mergeTenantWhere(where, tenantId) {
  if (!tenantId) return where;
  if (!where || Object.keys(where).length === 0) return { tenantId };
  if (where.tenantId === tenantId) return where;
  return { AND: [where, { tenantId }] };
}

prisma.$use(async (params, next) => {
  const tenantId = getCurrentTenantId();
  if (!tenantId || isTenantScopeBypassed() || !TENANT_SCOPED_MODELS.has(params.model)) {
    return next(params);
  }

  params.args ??= {};

  if (
    ['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany'].includes(
      params.action,
    )
  ) {
    params.args.where = mergeTenantWhere(params.args.where, tenantId);
  }

  if (params.action === 'findUnique') {
    params.action = 'findFirst';
    params.args.where = mergeTenantWhere(params.args.where, tenantId);
  }

  if (params.action === 'findUniqueOrThrow') {
    params.action = 'findFirstOrThrow';
    params.args.where = mergeTenantWhere(params.args.where, tenantId);
  }

  if (params.action === 'create') {
    params.args.data = {
      ...params.args.data,
      tenantId: params.args.data?.tenantId ?? tenantId ?? DEFAULT_TENANT_ID,
    };
  }

  if (params.action === 'createMany' && Array.isArray(params.args.data)) {
    params.args.data = params.args.data.map((entry) => ({
      ...entry,
      tenantId: entry.tenantId ?? tenantId ?? DEFAULT_TENANT_ID,
    }));
  }

  if (params.action === 'upsert') {
    params.args.create = {
      ...params.args.create,
      tenantId: params.args.create?.tenantId ?? tenantId ?? DEFAULT_TENANT_ID,
    };
  }

  return next(params);
});

// Attach connection monitoring and retry middleware
attachConnectionMonitoring(prisma);
attachRetryMiddleware(prisma);

// Start periodic connection monitoring (will be called in server.js)
export { startConnectionMonitoring };

export default prisma;
