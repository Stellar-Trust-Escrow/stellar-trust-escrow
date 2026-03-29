/**
 * Database Connection Pool Monitoring
 *
 * Monitors PostgreSQL connection pool metrics and updates Prometheus gauges.
 * Integrates with Prisma client to track connection health and pool status.
 */

import { createModuleLogger } from '../config/logger.js';
import {
  dbConnectionsActive,
  dbConnectionErrorsTotal,
  dbConnectionPoolExhaustionTotal,
} from './metrics.js';

const log = createModuleLogger('lib.connectionMonitor');

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
        log.warn({ message: 'db_monitor_high_latency', latencyMs: latency });
      }

      // Update active connections gauge (approximated)
      // This is a simplified approach - in production, integrate with pg pool events
      dbConnectionsActive.set(1); // At minimum, we have 1 active during health check
    } catch (error) {
      log.error({
        message: 'db_monitor_check_failed',
        error: error.message,
        stack: error.stack,
      });
      dbConnectionErrorsTotal.inc({ error_type: error.code || 'unknown' });
    }
  }, MONITORING_INTERVAL_MS);

  log.info({ message: 'db_monitor_started' });
}

/**
 * Stop connection pool monitoring
 */
export function stopConnectionMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    log.info({ message: 'db_monitor_stopped' });
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
      log.warn({ message: 'db_monitor_high_pending_queries', pendingQueries });
    }

    try {
      const result = await next(params);
      return result;
    } catch (error) {
      // Track connection-related errors
      if (
        error.code === 'P1001' ||
        error.code === 'P1017' ||
        error.message.includes('connection')
      ) {
        dbConnectionErrorsTotal.inc({ error_type: error.code || 'connection_error' });
      }
      throw error;
    } finally {
      pendingQueries--;
    }
  });
}
