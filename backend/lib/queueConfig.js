/**
 * BullMQ Queue Configuration for Stellar Event Processing
 *
 * Provides reliable event processing with retry logic, dead letter queues,
 * and monitoring capabilities for the escrow indexer.
 *
 * @module queueConfig
 */

import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

const isTest = process.env.NODE_ENV === 'test';

class InMemoryQueue {
  constructor(name) {
    this.name = name;
    this.jobs = [];
    this.paused = false;
  }

  async add(name, data) {
    const job = { id: `${this.name}-${this.jobs.length + 1}`, name, data };
    this.jobs.push(job);
    return job;
  }

  async getJobCounts() {
    return { waiting: this.jobs.length, active: 0, completed: 0, failed: 0, delayed: 0 };
  }

  async getWaiting() {
    return [...this.jobs];
  }

  async getActive() {
    return [];
  }

  async getCompleted() {
    return [];
  }

  async getFailed() {
    return [];
  }

  async getJob() {
    return null;
  }

  async pause() {
    this.paused = true;
  }

  async resume() {
    this.paused = false;
  }

  async clean() {
    return [];
  }

  async close() {}
}

class InMemoryQueueEvents {
  on() {
    return this;
  }

  async close() {}
}

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  retryDelayOnFailover: 100,
  lazyConnect: true,
};

// Create Redis connection
const connection = isTest
  ? { info: async () => '', quit: async () => undefined }
  : new IORedis(redisConfig);

// Queue names
export const QUEUE_NAMES = {
  STELLAR_EVENTS: 'stellar-events',
  DEAD_LETTER: 'stellar-events-dead-letter',
};

const createQueue = (name, options = {}) =>
  isTest ? new InMemoryQueue(name) : new Queue(name, { connection, ...options });

const createQueueEvents = (name) =>
  isTest ? new InMemoryQueueEvents() : new QueueEvents(name, { connection });

// Main event processing queue with retry configuration
export const stellarEventsQueue = createQueue(QUEUE_NAMES.STELLAR_EVENTS, {
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Dead letter queue for permanently failed jobs
export const deadLetterQueue = createQueue(QUEUE_NAMES.DEAD_LETTER, {
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 10,
  },
});

// Queue events for monitoring
export const queueEvents = createQueueEvents(QUEUE_NAMES.STELLAR_EVENTS);

// Dead letter queue events
export const deadLetterQueueEvents = createQueueEvents(QUEUE_NAMES.DEAD_LETTER);

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
  queueEvents.on('completed', ({ jobId }) => {
    queueMetrics.completedJobs++;
    console.log(`[Queue] Job ${jobId} completed successfully`);
  });

  queueEvents.on('failed', ({ jobId, failedReason }) => {
    queueMetrics.failedJobs++;
    console.error(`[Queue] Job ${jobId} failed:`, failedReason);

    if (queueMetrics.getFailureRate() > 5) {
      console.warn(
        `[ALERT] High failure rate detected: ${queueMetrics.getFailureRate().toFixed(2)}%`,
      );
    }
  });

  queueEvents.on('progress', ({ jobId, data }) => {
    console.log(`[Queue] Job ${jobId} progress:`, data);
  });

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
