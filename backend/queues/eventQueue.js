/**
 * Blockchain Event Queue — BullMQ-backed event processing with retry logic
 *
 * This queue handles raw blockchain event payloads with automatic retry on failure
 * and Dead Letter Queue (DLQ) routing for exhausted retries.
 *
 * Idempotency is ensured by tracking processed event hashes in the database,
 * preventing duplicate insertions even if the same event is processed multiple times.
 *
 * Failed jobs can be inspected via:
 *   - Use eventQueue.getFailed() to list jobs that have exhausted all retries
 *   - Use eventQueue.getJob(jobId) to inspect individual job details
 *   - Logs will show retry attempts with exponential backoff (1s, 2s, 4s, 8s, ...)
 */

import { Queue, Worker } from 'bullmq';
import prisma from '../lib/prisma.js';
import { logger } from '../config/logger.js';

const redisConnection = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL }
  : {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    };

// Create the main event queue with retry configuration
const eventQueue = new Queue('blockchain-events', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5, // Retry up to 5 times
    backoff: {
      type: 'exponential',
      delay: 1000, // Start with 1 second, doubles on each retry
    },
    removeOnComplete: true, // Remove successful jobs to save memory
    removeOnFail: false, // Keep failed jobs for inspection
  },
});

// Create a separate DLQ for jobs that have exhausted all retries
const eventDLQ = new Queue('blockchain-events-dlq', {
  connection: redisConnection,
});

/**
 * Worker that processes blockchain events
 *
 * Each job contains a raw blockchain event payload. The worker:
 * 1. Generates a deterministic hash of the event to ensure idempotency
 * 2. Checks if this event has already been processed
 * 3. Writes the event to the database if new
 * 4. Throws an error on database failures (triggers automatic retry)
 */
const eventWorker = new Worker(
  'blockchain-events',
  async (job) => {
    const { eventPayload, eventType, blockHeight, txHash } = job.data;

    if (!eventPayload || !eventType) {
      throw new Error('Missing required fields: eventPayload, eventType');
    }

    try {
      // Generate idempotency key from event content
      const crypto = await import('crypto');
      const eventHash = crypto
        .createHash('sha256')
        .update(JSON.stringify({ eventType, eventPayload, blockHeight, txHash }))
        .digest('hex');

      // Check if this event has already been processed (idempotency)
      const existingEvent = await prisma.blockchainEvent.findUnique({
        where: { eventHash },
      });

      if (existingEvent) {
        logger.info(`[EventQueue] Skipped duplicate event: ${eventHash}`);
        return { status: 'skipped', eventHash, reason: 'duplicate' };
      }

      // Insert the event into the database
      const result = await prisma.blockchainEvent.create({
        data: {
          eventType,
          eventPayload,
          eventHash,
          blockHeight: blockHeight || null,
          txHash: txHash || null,
          processedAt: new Date(),
        },
      });

      logger.info(`[EventQueue] Processed event ${eventHash} (ID: ${result.id})`);
      return {
        status: 'success',
        eventId: result.id,
        eventHash,
      };
    } catch (error) {
      logger.error(`[EventQueue] Failed to process event on attempt ${job.attemptsMade}:`, error);

      // On the final attempt, move the job to the DLQ
      if (job.attemptsMade >= job.opts.attempts) {
        await eventDLQ.add(
          'failed-event',
          {
            originalJobData: job.data,
            lastError: error.message,
            attemptsMade: job.attemptsMade,
            failedAt: new Date().toISOString(),
          },
          { removeOnComplete: false },
        );
        logger.warn(`[EventQueue] Job ${job.id} moved to DLQ after exhausting retries`);
      }

      // Throw to trigger retry or mark as failed
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1, // Process events sequentially
  },
);

// Event listeners for monitoring
eventWorker.on('completed', (job) => {
  logger.debug(`[EventQueue] Job ${job.id} completed successfully`);
});

eventWorker.on('failed', (job, err) => {
  logger.debug(`[EventQueue] Job ${job.id} failed: ${err.message}`);
});

/**
 * Add a blockchain event to the queue
 *
 * @param {string} eventType - Type of the blockchain event
 * @param {object} eventPayload - The raw event data
 * @param {number} blockHeight - Optional block height
 * @param {string} txHash - Optional transaction hash
 * @returns {Promise<{id: string, queued: number}>}
 */
export async function enqueueBlockchainEvent(
  eventType,
  eventPayload,
  blockHeight = null,
  txHash = null,
) {
  const job = await eventQueue.add('process-event', {
    eventType,
    eventPayload,
    blockHeight,
    txHash,
  });

  return {
    queued: 1,
    jobId: job.id,
  };
}

/**
 * Get the current state of the event queue
 * @returns {Promise<{waiting: number, active: number, failed: number, dlq: number}>}
 */
export async function getEventQueueStatus() {
  const [waitingCount, activeCount, failedCount] = await Promise.all([
    eventQueue.getWaitingCount(),
    eventQueue.getActiveCount(),
    eventQueue.getFailedCount(),
  ]);

  const dlqCount = await eventDLQ.getWaitingCount();

  return {
    queue: {
      waiting: waitingCount,
      active: activeCount,
      failed: failedCount,
    },
    dlq: {
      count: dlqCount,
    },
  };
}

/**
 * Get failed jobs that have exhausted retries (in DLQ)
 * @returns {Promise<Array>}
 */
export async function getFailedEvents() {
  return eventDLQ.getWaiting();
}

/**
 * Get a specific job details
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export async function getJobDetails(jobId) {
  return eventQueue.getJob(jobId);
}

/**
 * Clear all failed events from the DLQ (admin only)
 * @returns {Promise<void>}
 */
export async function clearDLQ() {
  await eventDLQ.clean(0, 'failed');
  logger.info('[EventQueue] DLQ cleared');
}

// Test-only reset function
export function __resetForTests() {
  if (process.env.NODE_ENV === 'test') {
    eventQueue.__resetForTests?.();
    eventDLQ.__resetForTests?.();
  }
}

export default {
  eventQueue,
  eventDLQ,
  enqueueBlockchainEvent,
  getEventQueueStatus,
  getFailedEvents,
  getJobDetails,
  clearDLQ,
  __resetForTests,
};
