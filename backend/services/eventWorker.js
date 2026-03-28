/**
 * Stellar Event Processing Worker
 *
 * Handles processing of Stellar events from the queue with automatic retry logic
 * and dead letter queue handling for permanent failures.
 *
 * @module eventWorker
 */

import { Worker } from 'bullmq';
import { connection, stellarEventsQueue, deadLetterQueue, queueMetrics } from '../lib/queueConfig.js';

/**
 * Processes a single Stellar event
 * @param {Object} job - BullMQ job containing event data
 */
const processStellarEvent = async (job) => {
  const { event, ledger } = job.data;
  
  try {
    queueMetrics.totalJobs++;
    
    // Update job progress
    await job.updateProgress(10);
    
    // Validate event data
    if (!event || !ledger) {
      throw new Error('Invalid event data: missing event or ledger information');
    }
    
    await job.updateProgress(25);
    
    // Route event to appropriate handler based on event type
    const eventType = parseEventType(event);
    
    await job.updateProgress(50);
    
    // Process the event (this would call the actual handler functions)
    await processEventByType(eventType, event, ledger);
    
    await job.updateProgress(75);
    
    // Update last processed ledger
    await updateLastProcessedLedger(ledger);
    
    await job.updateProgress(100);
    
    console.log(`[Worker] Successfully processed ${eventType} event from ledger ${ledger}`);
    
  } catch (error) {
    console.error(`[Worker] Error processing event:`, error);
    
    // Add context to the error for better debugging
    error.eventData = { event, ledger };
    error.timestamp = new Date().toISOString();
    
    throw error; // Re-throw to trigger BullMQ retry logic
  }
};

/**
 * Parses event type from Stellar event topic
 * @param {Object} event - Stellar event object
 * @returns {string} Event type
 */
const parseEventType = (event) => {
  if (!event.topic || !event.topic[0]) {
    throw new Error('Event missing topic information');
  }
  
  // Convert topic to readable event name
  const topicHex = event.topic[0];
  const eventMap = {
    '6573635f637274': 'EscrowCreated', // esc_crt
    '6d696c5f616464': 'MilestoneAdded', // mil_add
    '6d696c5f737562': 'MilestoneSubmitted', // mil_sub
    '6d696c5f617070': 'MilestoneApproved', // mil_app
    '66756e645f726c': 'FundsReleased', // fun_rl
    '6573635f63616e': 'EscrowCancelled', // esc_can
    '6469735f726169': 'DisputeRaised', // dis_rai
    '6469735f726573': 'DisputeResolved', // dis_res
    '7265705f757064': 'ReputationUpdated', // rep_upd
  };
  
  return eventMap[topicHex] || 'Unknown';
};

/**
 * Routes event to the appropriate handler function
 * @param {string} eventType - Type of event
 * @param {Object} event - Event data
 * @param {number} ledger - Ledger number
 */
const processEventByType = async (eventType, event, ledger) => {
  // Import handlers dynamically to avoid circular dependencies
  const {
    handleEscrowCreated,
    handleMilestoneAdded,
    handleMilestoneSubmitted,
    handleMilestoneApproved,
    handleFundsReleased,
    handleEscrowCancelled,
    handleDisputeRaised,
    handleDisputeResolved,
    handleReputationUpdated,
  } = await import('./escrowIndexer.js');
  
  switch (eventType) {
    case 'EscrowCreated':
      return await handleEscrowCreated(event);
    case 'MilestoneAdded':
      return await handleMilestoneAdded(event);
    case 'MilestoneSubmitted':
      return await handleMilestoneSubmitted(event);
    case 'MilestoneApproved':
      return await handleMilestoneApproved(event);
    case 'FundsReleased':
      return await handleFundsReleased(event);
    case 'EscrowCancelled':
      return await handleEscrowCancelled(event);
    case 'DisputeRaised':
      return await handleDisputeRaised(event);
    case 'DisputeResolved':
      return await handleDisputeResolved(event);
    case 'ReputationUpdated':
      return await handleReputationUpdated(event);
    default:
      throw new Error(`Unknown event type: ${eventType}`);
  }
};

/**
 * Updates the last processed ledger in the database
 * @param {number} ledger - Ledger number
 */
const updateLastProcessedLedger = async (ledger) => {
  try {
    // TODO: Implement database update
    // await prisma.indexerState.upsert({
    //   where: { id: 1 },
    //   update: { lastProcessedLedger: ledger },
    //   create: { id: 1, lastProcessedLedger: ledger },
    // });
    
    console.log(`[Worker] Updated last processed ledger to ${ledger}`);
  } catch (error) {
    console.error('[Worker] Error updating last processed ledger:', error);
    throw error;
  }
};

/**
 * Dead letter queue processor for handling permanently failed events
 */
const processDeadLetterEvent = async (job) => {
  const { originalJob, error, attemptsMade } = job.data;
  
  console.error(`[DeadLetter] Processing permanently failed job after ${attemptsMade} attempts:`, error);
  
  try {
    // Log the failure for manual investigation
    await logPermanentFailure(originalJob, error, attemptsMade);
    
    // TODO: Send alert to monitoring system
    // await alertService.sendAlert({
    //   type: 'PERMANENT_EVENT_FAILURE',
    //   data: { originalJob, error, attemptsMade }
    // });
    
    console.log('[DeadLetter] Successfully logged permanent failure');
  } catch (logError) {
    console.error('[DeadLetter] Error processing dead letter job:', logError);
    throw logError;
  }
};

/**
 * Logs permanent failures to database for investigation
 * @param {Object} originalJob - Original job data
 * @param {Error} error - Error that caused failure
 * @param {number} attemptsMade - Number of retry attempts
 */
const logPermanentFailure = async (originalJob, error, attemptsMade) => {
  try {
    // TODO: Implement database logging
    // await prisma.permanentFailure.create({
    //   data: {
    //     eventData: originalJob.data,
    //     errorMessage: error.message,
    //     errorStack: error.stack,
    //     attemptsMade,
    //     failedAt: new Date(),
    //   }
    // });
    
    console.log('[DeadLetter] Permanent failure logged successfully');
  } catch (logError) {
    console.error('[DeadLetter] Error logging permanent failure:', logError);
    throw logError;
  }
};

/**
 * Create and configure the main event processing worker
 */
export const createEventWorker = () => {
  const worker = new Worker(
    'stellar-events',
    processStellarEvent,
    {
      connection,
      concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5'),
      limiter: {
        max: 100,
        duration: 60000, // 100 jobs per minute
      },
    }
  );
  
  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} completed`);
  });
  
  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job.id} failed:`, err.message);
    
    // Move to dead letter queue after max attempts
    if (job.attemptsMade >= job.opts.attempts) {
      deadLetterQueue.add('dead-letter-event', {
        originalJob: job.data,
        error: {
          message: err.message,
          stack: err.stack,
        },
        attemptsMade: job.attemptsMade,
      });
    }
  });
  
  worker.on('error', (err) => {
    console.error('[Worker] Worker error:', err);
  });
  
  return worker;
};

/**
 * Create and configure the dead letter queue worker
 */
export const createDeadLetterWorker = () => {
  const worker = new Worker(
    'stellar-events-dead-letter',
    processDeadLetterEvent,
    {
      connection,
      concurrency: 2, // Lower concurrency for dead letter processing
    }
  );
  
  worker.on('completed', (job) => {
    console.log(`[DeadLetter] Job ${job.id} completed`);
  });
  
  worker.on('failed', (job, err) => {
    console.error(`[DeadLetter] Job ${job.id} failed:`, err);
  });
  
  worker.on('error', (err) => {
    console.error('[DeadLetter] Worker error:', err);
  });
  
  return worker;
};

// Export functions for testing
export {
  processStellarEvent,
  parseEventType,
  processEventByType,
  updateLastProcessedLedger,
  processDeadLetterEvent,
  logPermanentFailure,
};
