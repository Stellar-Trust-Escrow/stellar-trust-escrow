/**
 * Prisma Query Metrics
 *
 * Attaches a Prisma middleware that records query duration, total count,
 * and slow query count for every DB operation.
 *
 * Usage:
 *   import { attachPrismaMetrics } from './lib/prismaMetrics.js';
 *   attachPrismaMetrics(prisma);
 */

import { dbQueryDuration, dbQueryTotal, dbSlowQueryTotal } from './metrics.js';

const SLOW_QUERY_THRESHOLD_MS = parseInt(process.env.SLOW_QUERY_THRESHOLD_MS || '200');

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function attachPrismaMetrics(prisma) {
  prisma.$use(async (params, next) => {
    const start = Date.now();
    const result = await next(params);
    const durationMs = Date.now() - start;

    const model = params.model || 'unknown';
    const operation = params.action || 'unknown';

    dbQueryDuration.observe({ model, operation }, durationMs);
    dbQueryTotal.inc({ model, operation });

    if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
      dbSlowQueryTotal.inc({ model, operation });

      // Enhanced slow query logging with optimization hints
      const queryInfo = getQueryOptimizationHints(params, durationMs);
      console.warn(
        `[SLOW QUERY] ${model}.${operation} — ${durationMs}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`,
        queryInfo,
      );

      // Log full query details in development for debugging
      if (process.env.NODE_ENV === 'development') {
        console.warn('[SLOW QUERY DETAILS]', {
          model,
          operation,
          args: params.args,
          durationMs,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return result;
  });
}

/**
 * Provide optimization hints based on query characteristics
 * @param {Object} params - Prisma query params
 * @param {number} durationMs - Query duration
 * @returns {Object} Optimization hints
 */
function getQueryOptimizationHints(params, durationMs) {
  const hints = {};
  const { model, action, args } = params;

  // Check for potentially expensive operations
  if (action === 'findMany' && !args?.take) {
    hints.warning = 'findMany without limit - consider pagination';
  }

  if (action === 'findMany' && args?.include && Object.keys(args.include).length > 3) {
    hints.warning = 'Heavy include - consider selective field loading';
  }

  if (action === 'findMany' && args?.where && Object.keys(args.where).length > 5) {
    hints.suggestion = 'Complex where clause - review indexes';
  }

  if (durationMs > 1000) {
    hints.critical = 'Very slow query - immediate optimization needed';
  }

  // Model-specific hints
  if (model === 'ContractEvent' && action === 'findMany') {
    hints.suggestion = 'ContractEvent queries can be expensive - ensure proper indexing';
  }

  return hints;
}
