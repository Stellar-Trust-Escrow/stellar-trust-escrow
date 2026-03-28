/**
 * Alert Service for Queue Monitoring
 *
 * Monitors queue health and sends alerts when thresholds are exceeded.
 * Supports multiple alert channels including console, email, and webhooks.
 *
 * @module alertService
 */

import { queueMetrics } from '../lib/queueConfig.js';

/**
 * Alert severity levels
 */
export const ALERT_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
};

/**
 * Alert types
 */
export const ALERT_TYPES = {
  HIGH_FAILURE_RATE: 'high_failure_rate',
  REDIS_CONNECTION_LOST: 'redis_connection_lost',
  QUEUE_PROCESSING_STOPPED: 'queue_processing_stopped',
  DEAD_LETTER_QUEUE_FULL: 'dead_letter_queue_full',
  MEMORY_USAGE_HIGH: 'memory_usage_high',
  SYNC_LAG_HIGH: 'sync_lag_high',
};

/**
 * Alert configuration
 */
const ALERT_CONFIG = {
  FAILURE_RATE_THRESHOLD: 5.0, // 5%
  DEAD_LETTER_THRESHOLD: 100, // 100 jobs in dead letter queue
  MEMORY_USAGE_THRESHOLD: 90, // 90% memory usage
  SYNC_LAG_THRESHOLD: 30000, // 30 seconds in milliseconds
  ALERT_COOLDOWN: 300000, // 5 minutes between same alert type
};

/**
 * Track last sent alerts to prevent spam
 */
const lastAlerts = new Map();

/**
 * Check if an alert should be sent (cooldown period)
 * @param {string} alertType - Type of alert
 * @returns {boolean} Whether alert should be sent
 */
const shouldSendAlert = (alertType) => {
  const lastSent = lastAlerts.get(alertType);
  if (!lastSent) return true;
  
  const timeSinceLastAlert = Date.now() - lastSent;
  return timeSinceLastAlert > ALERT_CONFIG.ALERT_COOLDOWN;
};

/**
 * Mark alert as sent
 * @param {string} alertType - Type of alert
 */
const markAlertSent = (alertType) => {
  lastAlerts.set(alertType, Date.now());
};

/**
 * Send alert to all configured channels
 * @param {Object} alertData - Alert data
 */
const sendAlert = async (alertData) => {
  const { type, severity, message, metadata } = alertData;
  
  if (!shouldSendAlert(type)) {
    console.log(`[Alert] Skipped ${type} alert due to cooldown`);
    return;
  }
  
  const timestamp = new Date().toISOString();
  const alert = {
    type,
    severity,
    message,
    metadata,
    timestamp,
    service: 'stellar-event-queue',
  };
  
  try {
    // Send to console (always)
    consoleAlert(alert);
    
    // Send to email if configured
    if (process.env.ALERT_EMAIL_ENABLED === 'true') {
      await emailAlert(alert);
    }
    
    // Send to webhook if configured
    if (process.env.ALERT_WEBHOOK_URL) {
      await webhookAlert(alert);
    }
    
    // Send to monitoring system if configured
    if (process.env.MONITORING_SYSTEM_ENABLED === 'true') {
      await monitoringSystemAlert(alert);
    }
    
    markAlertSent(type);
    console.log(`[Alert] ${type} alert sent successfully`);
    
  } catch (error) {
    console.error('[Alert] Error sending alert:', error);
  }
};

/**
 * Console alert handler
 * @param {Object} alert - Alert data
 */
const consoleAlert = (alert) => {
  const emoji = {
    [ALERT_SEVERITY.INFO]: 'ℹ️',
    [ALERT_SEVERITY.WARNING]: '⚠️',
    [ALERT_SEVERITY.ERROR]: '❌',
    [ALERT_SEVERITY.CRITICAL]: '🚨',
  };
  
  console.log(
    `${emoji[alert.severity]} [ALERT] ${alert.type.toUpperCase()}: ${alert.message}`
  );
  console.log(`[ALERT] Timestamp: ${alert.timestamp}`);
  if (alert.metadata) {
    console.log(`[ALERT] Metadata:`, JSON.stringify(alert.metadata, null, 2));
  }
  console.log('---');
};

/**
 * Email alert handler
 * @param {Object} alert - Alert data
 */
const emailAlert = async (alert) => {
  try {
    // TODO: Implement email sending
    // const emailService = await import('./emailService.js');
    // await emailService.sendAlert({
    //   to: process.env.ALERT_EMAIL_RECIPIENTS?.split(','),
    //   subject: `[${alert.severity.toUpperCase()}] ${alert.type}`,
    //   body: formatEmailAlert(alert),
    // });
    
    console.log(`[Alert] Email alert would be sent for ${alert.type}`);
  } catch (error) {
    console.error('[Alert] Error sending email alert:', error);
  }
};

/**
 * Webhook alert handler
 * @param {Object} alert - Alert data
 */
const webhookAlert = async (alert) => {
  try {
    const response = await fetch(process.env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(alert),
    });
    
    if (!response.ok) {
      throw new Error(`Webhook responded with ${response.status}`);
    }
    
    console.log(`[Alert] Webhook alert sent successfully for ${alert.type}`);
  } catch (error) {
    console.error('[Alert] Error sending webhook alert:', error);
  }
};

/**
 * Monitoring system alert handler
 * @param {Object} alert - Alert data
 */
const monitoringSystemAlert = async (alert) => {
  try {
    // TODO: Implement monitoring system integration
    // Could integrate with Prometheus, Datadog, New Relic, etc.
    console.log(`[Alert] Monitoring system alert would be sent for ${alert.type}`);
  } catch (error) {
    console.error('[Alert] Error sending monitoring system alert:', error);
  }
};

/**
 * Format alert for email
 * @param {Object} alert - Alert data
 * @returns {string} Formatted email content
 */
const formatEmailAlert = (alert) => {
  return `
Alert: ${alert.type}
Severity: ${alert.severity}
Message: ${alert.message}
Timestamp: ${alert.timestamp}
Service: ${alert.service}

Metadata:
${JSON.stringify(alert.metadata, null, 2)}

---
This alert was generated by the Stellar Event Queue Monitoring System.
  `.trim();
};

/**
 * Monitor queue health and send alerts as needed
 */
export const monitorQueueHealth = async () => {
  try {
    const failureRate = queueMetrics.getFailureRate();
    const successRate = queueMetrics.getSuccessRate();
    const deadLetterCount = queueMetrics.deadLetterCount;
    
    // Check failure rate
    if (failureRate > ALERT_CONFIG.FAILURE_RATE_THRESHOLD) {
      await sendAlert({
        type: ALERT_TYPES.HIGH_FAILURE_RATE,
        severity: failureRate > 10 ? ALERT_SEVERITY.ERROR : ALERT_SEVERITY.WARNING,
        message: `High failure rate detected: ${failureRate.toFixed(2)}% (${queueMetrics.failedJobs}/${queueMetrics.totalJobs} jobs)`,
        metadata: {
          failureRate,
          successRate,
          totalJobs: queueMetrics.totalJobs,
          failedJobs: queueMetrics.failedJobs,
          threshold: ALERT_CONFIG.FAILURE_RATE_THRESHOLD,
        },
      });
    }
    
    // Check dead letter queue size
    if (deadLetterCount > ALERT_CONFIG.DEAD_LETTER_THRESHOLD) {
      await sendAlert({
        type: ALERT_TYPES.DEAD_LETTER_QUEUE_FULL,
        severity: deadLetterCount > 500 ? ALERT_SEVERITY.ERROR : ALERT_SEVERITY.WARNING,
        message: `Dead letter queue has ${deadLetterCount} jobs (threshold: ${ALERT_CONFIG.DEAD_LETTER_THRESHOLD})`,
        metadata: {
          deadLetterCount,
          threshold: ALERT_CONFIG.DEAD_LETTER_THRESHOLD,
        },
      });
    }
    
    // Check sync lag (would need to be calculated from event timestamps)
    const syncLag = await calculateSyncLag();
    if (syncLag > ALERT_CONFIG.SYNC_LAG_THRESHOLD) {
      await sendAlert({
        type: ALERT_TYPES.SYNC_LAG_HIGH,
        severity: syncLag > 60000 ? ALERT_SEVERITY.ERROR : ALERT_SEVERITY.WARNING,
        message: `Index sync lag is ${(syncLag / 1000).toFixed(1)} seconds (threshold: ${ALERT_CONFIG.SYNC_LAG_THRESHOLD / 1000}s)`,
        metadata: {
          syncLag,
          threshold: ALERT_CONFIG.SYNC_LAG_THRESHOLD,
        },
      });
    }
    
  } catch (error) {
    console.error('[Alert] Error monitoring queue health:', error);
  }
};

/**
 * Calculate sync lag between blockchain and database
 * @returns {number} Sync lag in milliseconds
 */
const calculateSyncLag = async () => {
  try {
    // TODO: Implement sync lag calculation
    // This would compare the latest blockchain ledger with the last processed ledger
    // For now, return 0 as placeholder
    return 0;
  } catch (error) {
    console.error('[Alert] Error calculating sync lag:', error);
    return 0;
  }
};

/**
 * Alert for Redis connection issues
 * @param {boolean} connected - Redis connection status
 */
export const alertRedisConnection = async (connected) => {
  if (!connected) {
    await sendAlert({
      type: ALERT_TYPES.REDIS_CONNECTION_LOST,
      severity: ALERT_SEVERITY.CRITICAL,
      message: 'Redis connection lost - queue processing will be affected',
      metadata: {
        connectionStatus: connected,
      },
    });
  }
};

/**
 * Alert for queue processing stopped
 * @param {number} waitingJobs - Number of waiting jobs
 * @param {number} activeJobs - Number of active jobs
 */
export const alertQueueProcessingStopped = async (waitingJobs, activeJobs) => {
  if (waitingJobs > 0 && activeJobs === 0) {
    await sendAlert({
      type: ALERT_TYPES.QUEUE_PROCESSING_STOPPED,
      severity: ALERT_SEVERITY.WARNING,
      message: `Queue has ${waitingJobs} waiting jobs but no active processing`,
      metadata: {
        waitingJobs,
        activeJobs,
      },
    });
  }
};

/**
 * Start the monitoring service
 */
export const startMonitoring = () => {
  // Monitor every 30 seconds
  setInterval(monitorQueueHealth, 30000);
  
  console.log('[Alert] Queue monitoring service started');
};

// Export for testing
export {
  sendAlert,
  shouldSendAlert,
  markAlertSent,
  consoleAlert,
  emailAlert,
  webhookAlert,
  monitoringSystemAlert,
  formatEmailAlert,
  calculateSyncLag,
};
