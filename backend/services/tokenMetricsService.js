/**
 * Token Metrics Service
 * 
 * Provides comprehensive logging and metrics for token usage,
 * rotation rates, and security monitoring.
 */

import prisma from '../lib/prisma.js';
import cacheService from './cacheService.js';

const METRICS_PREFIX = 'token_metrics:';
const METRICS_TTL = 24 * 60 * 60; // 24 hours

// Metrics counters
const metrics = {
  tokensGenerated: 0,
  tokensRefreshed: 0,
  tokensRevoked: 0,
  tokensBlacklisted: 0,
  refreshAttempts: 0,
  refreshFailures: 0,
  autoRefreshes: 0,
  concurrentSessions: 0,
  suspiciousActivity: 0
};

/**
 * Initialize metrics collection
 */
async function initializeMetrics() {
  try {
    // Load existing metrics from cache
    const cachedMetrics = await cacheService.get('token_metrics_global');
    if (cachedMetrics) {
      Object.assign(metrics, cachedMetrics);
    }
    
    console.log('[TokenMetrics] Service initialized');
  } catch (error) {
    console.error('[TokenMetrics] Initialization failed:', error.message);
  }
}

/**
 * Record token generation
 */
async function recordTokenGeneration(userId, tenantId, tokenType = 'access', deviceInfo = {}) {
  try {
    metrics.tokensGenerated++;
    
    const metricData = {
      event: 'token_generated',
      userId,
      tenantId,
      tokenType,
      deviceInfo,
      timestamp: new Date().toISOString()
    };

    // Store in cache for analytics
    await cacheService.set(
      `${METRICS_PREFIX}generated:${Date.now()}`,
      metricData,
      METRICS_TTL
    );

    // Update global metrics
    await updateGlobalMetrics();
    
    console.log(`[TokenMetrics] Generated ${tokenType} token for user ${userId}`);
  } catch (error) {
    console.error('[TokenMetrics] Failed to record token generation:', error.message);
  }
}

/**
 * Record token refresh
 */
async function recordTokenRefresh(userId, tenantId, success = true, reason = '') {
  try {
    metrics.refreshAttempts++;
    
    if (success) {
      metrics.tokensRefreshed++;
    } else {
      metrics.refreshFailures++;
    }

    const metricData = {
      event: 'token_refresh',
      userId,
      tenantId,
      success,
      reason,
      timestamp: new Date().toISOString()
    };

    await cacheService.set(
      `${METRICS_PREFIX}refresh:${Date.now()}`,
      metricData,
      METRICS_TTL
    );

    await updateGlobalMetrics();
    
    console.log(`[TokenMetrics] Token refresh ${success ? 'success' : 'failed'} for user ${userId}`);
  } catch (error) {
    console.error('[TokenMetrics] Failed to record token refresh:', error.message);
  }
}

/**
 * Record token revocation
 */
async function recordTokenRevocation(userId, tenantId, reason = 'logout') {
  try {
    metrics.tokensRevoked++;

    const metricData = {
      event: 'token_revoked',
      userId,
      tenantId,
      reason,
      timestamp: new Date().toISOString()
    };

    await cacheService.set(
      `${METRICS_PREFIX}revoked:${Date.now()}`,
      metricData,
      METRICS_TTL
    );

    await updateGlobalMetrics();
    
    console.log(`[TokenMetrics] Token revoked for user ${userId}: ${reason}`);
  } catch (error) {
    console.error('[TokenMetrics] Failed to record token revocation:', error.message);
  }
}

/**
 * Record token blacklisting
 */
async function recordTokenBlacklist(tokenType, reason = 'compromised') {
  try {
    metrics.tokensBlacklisted++;

    const metricData = {
      event: 'token_blacklisted',
      tokenType,
      reason,
      timestamp: new Date().toISOString()
    };

    await cacheService.set(
      `${METRICS_PREFIX}blacklisted:${Date.now()}`,
      metricData,
      METRICS_TTL
    );

    await updateGlobalMetrics();
    
    console.log(`[TokenMetrics] ${tokenType} token blacklisted: ${reason}`);
  } catch (error) {
    console.error('[TokenMetrics] Failed to record token blacklist:', error.message);
  }
}

/**
 * Record auto-refresh event
 */
async function recordAutoRefresh(userId, tenantId) {
  try {
    metrics.autoRefreshes++;

    const metricData = {
      event: 'auto_refresh',
      userId,
      tenantId,
      timestamp: new Date().toISOString()
    };

    await cacheService.set(
      `${METRICS_PREFIX}auto_refresh:${Date.now()}`,
      metricData,
      METRICS_TTL
    );

    await updateGlobalMetrics();
  } catch (error) {
    console.error('[TokenMetrics] Failed to record auto-refresh:', error.message);
  }
}

/**
 * Record suspicious activity
 */
async function recordSuspiciousActivity(userId, tenantId, activity, details = {}) {
  try {
    metrics.suspiciousActivity++;

    const metricData = {
      event: 'suspicious_activity',
      userId,
      tenantId,
      activity,
      details,
      timestamp: new Date().toISOString()
    };

    // Store suspicious activity with longer TTL
    await cacheService.set(
      `${METRICS_PREFIX}suspicious:${Date.now()}`,
      metricData,
      7 * 24 * 60 * 60 // 7 days
    );

    await updateGlobalMetrics();
    
    console.warn(`[TokenMetrics] Suspicious activity for user ${userId}: ${activity}`);
  } catch (error) {
    console.error('[TokenMetrics] Failed to record suspicious activity:', error.message);
  }
}

/**
 * Update concurrent sessions count
 */
async function updateConcurrentSessions() {
  try {
    const count = await prisma.refreshToken.count({
      where: {
        isActive: true,
        expiresAt: { gt: new Date() }
      }
    });
    
    metrics.concurrentSessions = count;
    await updateGlobalMetrics();
  } catch (error) {
    console.error('[TokenMetrics] Failed to update concurrent sessions:', error.message);
  }
}

/**
 * Update global metrics in cache
 */
async function updateGlobalMetrics() {
  try {
    await cacheService.set('token_metrics_global', metrics, METRICS_TTL);
  } catch (error) {
    console.error('[TokenMetrics] Failed to update global metrics:', error.message);
  }
}

/**
 * Get current metrics
 */
async function getMetrics() {
  try {
    await updateConcurrentSessions();
    return { ...metrics };
  } catch (error) {
    console.error('[TokenMetrics] Failed to get metrics:', error.message);
    return metrics;
  }
}

/**
 * Get metrics for a specific time range
 */
async function getMetricsByTimeRange(startTime, endTime) {
  try {
    // This would require Redis SCAN or time-based queries
    // For now, return basic metrics
    return {
      message: 'Time-range metrics require Redis time-series or database queries',
      currentMetrics: await getMetrics()
    };
  } catch (error) {
    console.error('[TokenMetrics] Failed to get time-range metrics:', error.message);
    return null;
  }
}

/**
 * Get user-specific metrics
 */
async function getUserMetrics(userId, tenantId) {
  try {
    const activeTokens = await prisma.refreshToken.count({
      where: {
        userId,
        tenantId,
        isActive: true,
        expiresAt: { gt: new Date() }
      }
    });

    return {
      userId,
      tenantId,
      activeTokens,
      lastActivity: new Date().toISOString()
    };
  } catch (error) {
    console.error('[TokenMetrics] Failed to get user metrics:', error.message);
    return null;
  }
}

/**
 * Generate metrics report for monitoring
 */
async function generateReport() {
  try {
    const currentMetrics = await getMetrics();
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTokensGenerated: currentMetrics.tokensGenerated,
        totalTokensRefreshed: currentMetrics.tokensRefreshed,
        totalTokensRevoked: currentMetrics.tokensRevoked,
        totalTokensBlacklisted: currentMetrics.tokensBlacklisted,
        refreshSuccessRate: currentMetrics.refreshAttempts > 0 
          ? ((currentMetrics.tokensRefreshed / currentMetrics.refreshAttempts) * 100).toFixed(2) + '%'
          : 'N/A',
        concurrentSessions: currentMetrics.concurrentSessions,
        suspiciousActivities: currentMetrics.suspiciousActivity,
        autoRefreshRate: currentMetrics.tokensGenerated > 0
          ? ((currentMetrics.autoRefreshes / currentMetrics.tokensGenerated) * 100).toFixed(2) + '%'
          : 'N/A'
      },
      details: currentMetrics
    };

    return report;
  } catch (error) {
    console.error('[TokenMetrics] Failed to generate report:', error.message);
    return null;
  }
}

/**
 * Reset metrics (for testing or maintenance)
 */
async function resetMetrics() {
  try {
    Object.keys(metrics).forEach(key => {
      if (typeof metrics[key] === 'number') {
        metrics[key] = 0;
      }
    });
    
    await updateGlobalMetrics();
    console.log('[TokenMetrics] Metrics reset');
  } catch (error) {
    console.error('[TokenMetrics] Failed to reset metrics:', error.message);
  }
}

// Initialize metrics on module load
initializeMetrics();

export default {
  recordTokenGeneration,
  recordTokenRefresh,
  recordTokenRevocation,
  recordTokenBlacklist,
  recordAutoRefresh,
  recordSuspiciousActivity,
  updateConcurrentSessions,
  getMetrics,
  getMetricsByTimeRange,
  getUserMetrics,
  generateReport,
  resetMetrics
};
