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

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    // Additional options for better error handling and performance
    errorFormat: 'minimal',
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Attach connection monitoring and retry middleware
attachConnectionMonitoring(prisma);
attachRetryMiddleware(prisma);

// Start periodic connection monitoring (will be called in server.js)
export { startConnectionMonitoring };

export default prisma;
