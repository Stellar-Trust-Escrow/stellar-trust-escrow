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

/* eslint-disable no-undef */
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
      console.warn(
        `[SLOW QUERY] ${model}.${operation} — ${durationMs}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`,
      );
    }

    return result;
  });
}
