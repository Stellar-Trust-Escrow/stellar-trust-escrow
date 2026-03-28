/**
 * Escrow Event Indexer
 *
 * Background service that polls the Stellar network for Soroban contract
 * events emitted by the escrow contract and writes them to PostgreSQL.
 *
 * This keeps the database in sync so the REST API can serve data quickly
 * without querying the blockchain on every request.
 *
 * ## Event → DB Mapping
 *
 * | Contract Event      | DB Action                              |
 * |---------------------|----------------------------------------|
 * | EscrowCreated       | INSERT into escrows table              |
 * | MilestoneAdded      | INSERT into milestones table           |
 * | MilestoneSubmitted  | UPDATE milestone status = Submitted    |
 * | MilestoneApproved   | UPDATE milestone status = Approved     |
 * | FundsReleased       | UPDATE escrow remaining_balance        |
 * | EscrowCancelled     | UPDATE escrow status = Cancelled       |
 * | DisputeRaised       | UPDATE escrow status = Disputed        |
 * | DisputeResolved     | UPDATE escrow status = Completed       |
 * | ReputationUpdated   | UPSERT reputation_records table        |
 *
 * @module escrowIndexer
 */

import { stellarEventsQueue } from '../lib/queueConfig.js';
import { setupQueueEventListeners } from '../lib/queueConfig.js';
import { startMonitoring } from './alertService.js';

// TODO (contributor): uncomment when dependencies are installed
// const { PrismaClient } = require('@prisma/client');

// const prisma = new PrismaClient();

/**
 * The last ledger sequence successfully processed.
 * Persisted to DB so the indexer can resume after restarts.
 *
 * @type {number}
 */
let lastProcessedLedger = parseInt(process.env.INDEXER_START_LEDGER || '0');

/**
 * Starts the indexer polling loop.
 *
 * Polls at the interval defined by INDEXER_POLL_INTERVAL_MS.
 * Each tick fetches new events since `lastProcessedLedger` and
 * queues them for processing via BullMQ.
 *
 * TODO (contributor — hard, Issue #27):
 * 1. Initialize Soroban RPC client
 * 2. Load lastProcessedLedger from DB (table: indexer_state)
 * 3. Start polling loop with setInterval
 * 4. On each tick, call fetchAndProcessEvents()
 * 5. Handle errors gracefully (log + continue, don't crash)
 */
const startIndexer = async () => {
  console.log(`[Indexer] Starting from ledger ${lastProcessedLedger}`);
  
  // Setup queue event listeners and monitoring
  setupQueueEventListeners();
  startMonitoring();
  
  // TODO: implement polling loop
  // const server = new SorobanRpc.Server(process.env.SOROBAN_RPC_URL);
  // setInterval(async () => {
  //   try {
  //     await fetchAndProcessEvents(server);
  //   } catch (err) {
  //     console.error('[Indexer] Error in polling tick:', err.message);
  //   }
  // }, parseInt(process.env.INDEXER_POLL_INTERVAL_MS || '5000'));

  console.log('[Indexer] TODO: implement — see Issue #27');
};

/**
 * Fetches contract events from Stellar since `lastProcessedLedger`
 * and queues each event for processing via BullMQ.
 *
 * @param {SorobanRpc.Server} server — initialized Soroban RPC client
 *
 * TODO (contributor — hard, Issue #27):
 * 1. Call server.getEvents({ startLedger, filters: [{ contractIds: [CONTRACT_ADDRESS] }] })
 * 2. For each event, queue it via BullMQ instead of direct processing
 * 3. Update lastProcessedLedger = latestLedger
 * 4. Persist lastProcessedLedger to DB
 */
const fetchAndProcessEvents = async (_server) => {
  // TODO: implement
  throw new Error('fetchAndProcessEvents not implemented — see Issue #27');
  
  // Example implementation when ready:
  // const events = await server.getEvents({
  //   startLedger: lastProcessedLedger,
  //   filters: [{ contractIds: [process.env.ESCORROW_CONTRACT_ADDRESS] }]
  // });
  // 
  // for (const event of events.events) {
  //   await stellarEventsQueue.add('process-stellar-event', {
  //     event,
  //     ledger: event.ledger
  //   }, {
  //     // Optional: customize job options per event type
  //     priority: getEventPriority(event),
  //     delay: getEventDelay(event)
  //   });
  // }
};

/**
 * Get processing priority for an event
 * @param {Object} event - Stellar event
 * @returns {number} Priority (higher = more important)
 */
const getEventPriority = (event) => {
  // High priority for critical events
  const highPriorityEvents = ['DisputeRaised', 'DisputeResolved'];
  const eventName = parseEventName(event);
  
  if (highPriorityEvents.includes(eventName)) {
    return 10;
  }
  return 1;
};

/**
 * Get processing delay for an event (if any)
 * @param {Object} event - Stellar event
 * @returns {number} Delay in milliseconds
 */
const getEventDelay = (event) => {
  // No delay by default, but could be used for throttling
  return 0;
};

/**
 * Parse event name from Stellar event topic
 * @param {Object} event - Stellar event
 * @returns {string} Event name
 */
const parseEventName = (event) => {
  if (!event.topic || !event.topic[0]) {
    return 'Unknown';
  }
  
  const topicHex = event.topic[0];
  const eventMap = {
    '6573635f637274': 'EscrowCreated',
    '6d696c5f616464': 'MilestoneAdded',
    '6d696c5f737562': 'MilestoneSubmitted',
    '6d696c5f617070': 'MilestoneApproved',
    '66756e645f726c': 'FundsReleased',
    '6573635f63616e': 'EscrowCancelled',
    '6469735f726169': 'DisputeRaised',
    '6469735f726573': 'DisputeResolved',
    '7265705f757064': 'ReputationUpdated',
  };
  
  return eventMap[topicHex] || 'Unknown';
};

/**
 * Routes a contract event to the correct handler based on its topic.
 * NOTE: This function is now called by the event worker, not directly.
 *
 * @param {object} event — raw Soroban event object from RPC
 *
 * TODO (contributor — medium, Issue #27):
 * Parse event.topic[0] to determine event type, then call the
 * appropriate handler (handleEscrowCreated, handleMilestoneAdded, etc.)
 */
const dispatchEvent = async (_event) => {
  // TODO: implement event routing
  // const eventName = parseEventName(event.topic);
  // switch (eventName) {
  //   case 'esc_crt': return handleEscrowCreated(event);
  //   case 'mil_add': return handleMilestoneAdded(event);
  //   ...
  // }
  console.log('[Indexer] dispatchEvent not implemented — see Issue #27');
};

/**
 * Handles an EscrowCreated event — inserts a new escrow row.
 *
 * @param {object} event — parsed EscrowCreated event
 *
 * Expected event data: (client, freelancer, amount)
 * Expected event topic: (symbol_short!("esc_crt"), escrow_id)
 *
 * TODO (contributor — medium, Issue #27):
 * 1. Parse escrow_id from topic[1]
 * 2. Parse client, freelancer, amount from data
 * 3. prisma.escrow.create({ data: { ... } })
 */
const handleEscrowCreated = async (_event) => {
  // TODO: implement
  console.log('[Indexer] handleEscrowCreated not implemented');
};

/**
 * Handles a MilestoneAdded event — inserts a new milestone row.
 *
 * TODO (contributor — medium, Issue #27)
 */
const handleMilestoneAdded = async (_event) => {
  // TODO: implement
};

/**
 * Handles a MilestoneSubmitted event — updates milestone status in DB.
 *
 * TODO (contributor — medium, Issue #27)
 */
const handleMilestoneSubmitted = async (_event) => {
  // TODO: implement
};

/**
 * Handles a MilestoneApproved event — updates milestone status in DB.
 *
 * TODO (contributor — medium, Issue #27)
 */
const handleMilestoneApproved = async (_event) => {
  // TODO: implement
};

/**
 * Handles a FundsReleased event — updates escrow remaining_balance.
 *
 * TODO (contributor — medium, Issue #27)
 */
const handleFundsReleased = async (_event) => {
  // TODO: implement
};

/**
 * Handles a DisputeRaised event — updates escrow status to Disputed.
 *
 * TODO (contributor — medium, Issue #27)
 */
const handleDisputeRaised = async (_event) => {
  // TODO: implement
};

/**
 * Handles a DisputeResolved event — sets status to Completed.
 *
 * TODO (contributor — medium, Issue #27)
 */
const handleDisputeResolved = async (_event) => {
  // TODO: implement
};

/**
 * Handles a ReputationUpdated event — upserts reputation record.
 *
 * TODO (contributor — medium, Issue #27)
 */
const handleReputationUpdated = async (_event) => {
  // TODO: implement
};

/**
 * Handles an EscrowCancelled event.
 *
 * TODO (contributor — easy, Issue #27)
 */
const handleEscrowCancelled = async (_event) => {
  // TODO: implement
};

export {
  startIndexer,
  fetchAndProcessEvents,
  dispatchEvent,
  // Export handlers for unit testing
  handleEscrowCreated,
  handleMilestoneAdded,
  handleMilestoneSubmitted,
  handleMilestoneApproved,
  handleFundsReleased,
  handleDisputeRaised,
  handleDisputeResolved,
  handleReputationUpdated,
  handleEscrowCancelled,
};
