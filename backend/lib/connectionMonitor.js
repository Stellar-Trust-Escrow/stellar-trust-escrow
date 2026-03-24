/**
 * Database Connection Pool Monitoring
 *
 * Monitors PostgreSQL connection pool metrics and updates Prometheus gauges.
 * Integrates with Prisma client to track connection health and pool status.
 */

import {
  dbConnectionsActive,
  dbConnectionsIdle,
  dbConnectionErrorsTotal,
  dbConnectionPoolExhaustionTotal,
} from './metrics.js';

const MONITORING_INTERVAL_MS = 30000; // Check every 30 seconds
let monitoringInterval;

/**
 * Initialize connection pool monitoring
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function startConnectionMonitoring(prisma) {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }

  // Prisma doesn't directly expose pool metrics, so we'll monitor via health checks
  // and connection attempts. For more detailed pool metrics, consider using pg directly.

  monitoringInterval = setInterval(async () => {
    try {
      // Test connection and measure latency
      const start = Date.now();
      await prisma.$queryRaw`SELECT 1 as health_check`;
      const latency = Date.now() - start;

      // Since we can't directly access pg pool, we'll use proxy metrics
      // In a production setup, you might want to expose pg pool metrics directly
      // For now, we'll track connection success/failure

      // If latency is very high, it might indicate pool issues
      if (latency > 5000) {
        console.warn(`[DB MONITOR] High connection latency: ${latency}ms`);
      }

      // Update active connections gauge (approximated)
      // This is a simplified approach - in production, integrate with pg pool events
      dbConnectionsActive.set(1); // At minimum, we have 1 active during health check

    } catch (error) {
      console.error('[DB MONITOR] Connection check failed:', error.message);
      dbConnectionErrorsTotal.inc({ error_type: error.code || 'unknown' });
    }
  }, MONITORING_INTERVAL_MS);

  console.log('[DB MONITOR] Connection monitoring started');
}

/**
 * Stop connection pool monitoring
 */
export function stopConnectionMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    console.log('[DB MONITOR] Connection monitoring stopped');
  }
}

/**
 * Enhanced Prisma middleware for connection monitoring
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function attachConnectionMonitoring(prisma) {
  // Track connection pool exhaustion (when queries have to wait)
  let pendingQueries = 0;

  prisma.$use(async (params, next) => {
    pendingQueries++;

    // If we have many pending queries, pool might be exhausted
    if (pendingQueries > 5) {
      dbConnectionPoolExhaustionTotal.inc();
      console.warn(`[DB MONITOR] High pending queries: ${pendingQueries}`);
    }

    try {
      const result = await next(params);
      return result;
    } catch (error) {
      // Track connection-related errors
      if (error.code === 'P1001' || error.code === 'P1017' || error.message.includes('connection')) {
        dbConnectionErrorsTotal.inc({ error_type: error.code || 'connection_error' });
      }
      throw error;
    } finally {
      pendingQueries--;
    }
  });
}