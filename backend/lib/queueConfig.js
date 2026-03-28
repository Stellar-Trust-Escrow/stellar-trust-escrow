/**
 * BullMQ Queue Configuration for Stellar Event Processing
 *
 * Provides reliable event processing with retry logic, dead letter queues,
 * and monitoring capabilities for the escrow indexer.
 *
 * @module queueConfig
 */

import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
};

// Create Redis connection
const connection = new IORedis(redisConfig);

// Queue names
export const QUEUE_NAMES = {
  STELLAR_EVENTS: 'stellar-events',
  DEAD_LETTER: 'stellar-events-dead-letter',
};

// Main event processing queue with retry configuration
export const stellarEventsQueue = new Queue(QUEUE_NAMES.STELLAR_EVENTS, {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50, // Keep last 50 failed jobs
    attempts: 5, // Retry 5 times
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 seconds
    },
  },
});

// Dead letter queue for permanently failed jobs
export const deadLetterQueue = new Queue(QUEUE_NAMES.DEAD_LETTER, {
  connection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 10,
  },
});

// Queue events for monitoring
export const queueEvents = new QueueEvents(QUEUE_NAMES.STELLAR_EVENTS, { connection });

// Dead letter queue events
export const deadLetterQueueEvents = new QueueEvents(QUEUE_NAMES.DEAD_LETTER, { connection });

/**
 * Metrics collector for queue monitoring
 */
export class QueueMetrics {
  constructor() {
    this.reset();
  }

  reset() {
    this.totalJobs = 0;
    this.completedJobs = 0;
    this.failedJobs = 0;
    this.retryCount = 0;
    this.deadLetterCount = 0;
    this.startTime = Date.now();
  }

  getFailureRate() {
    if (this.totalJobs === 0) return 0;
    return (this.failedJobs / this.totalJobs) * 100;
  }

  getSuccessRate() {
    if (this.totalJobs === 0) return 0;
    return (this.completedJobs / this.totalJobs) * 100;
  }

  getProcessingTime() {
    return Date.now() - this.startTime;
  }
}

export const queueMetrics = new QueueMetrics();

/**
 * Setup queue event listeners for metrics collection and alerting
 */
export const setupQueueEventListeners = () => {
  // Main queue events
  queueEvents.on('completed', ({ jobId }) => {
    queueMetrics.completedJobs++;
    console.log(`[Queue] Job ${jobId} completed successfully`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    queueMetrics.failedJobs++;
    console.error(`[Queue] Job ${jobId} failed:`, failedReason);
    
    // Check failure rate and alert if > 5%
    if (queueMetrics.getFailureRate() > 5) {
      console.warn(`[ALERT] High failure rate detected: ${queueMetrics.getFailureRate().toFixed(2)}%`);
      // TODO: Send alert to monitoring system
    }
  });

  queueEvents.on('progress', ({ jobId, data }) => {
    console.log(`[Queue] Job ${jobId} progress:`, data);
  });

  // Dead letter queue events
  deadLetterQueueEvents.on('completed', ({ jobId }) => {
    console.log(`[DeadLetter] Job ${jobId} processed from dead letter queue`);
  });

  deadLetterQueueEvents.on('added', ({ jobId }) => {
    queueMetrics.deadLetterCount++;
    console.warn(`[DeadLetter] Job ${jobId} moved to dead letter queue`);
  });
};

/**
 * Graceful shutdown for queues
 */
export const closeQueues = async () => {
  try {
    await stellarEventsQueue.close();
    await deadLetterQueue.close();
    await queueEvents.close();
    await deadLetterQueueEvents.close();
    await connection.quit();
    console.log('[Queue] All queues closed gracefully');
  } catch (error) {
    console.error('[Queue] Error closing queues:', error);
  }
};

// Handle process termination
process.on('SIGTERM', closeQueues);
process.on('SIGINT', closeQueues);

export { connection };
