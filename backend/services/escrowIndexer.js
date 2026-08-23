/**
 * Exactly-Once Escrow Event Indexer
 *
 * Polls Soroban contract events for the escrow contract and projects them into
 * the CQRS write model (`services/escrowService`). The indexer is the *only*
 * writer of `contract_events` rows; everything else reads them.
 *
 * ## Exactly-once guarantees
 *
 *  * **Idempotent upsert.** Every event is recorded with
 *    `prisma.contractEvent.upsert({ where: { eventId }, ... })`. Replaying an
 *    already-indexed event resolves to the `update` branch, so a crash-and-restart
 *    (or a duplicate RPC batch) can never create a second row.
 *  * **Crash-safe cursor.** The ledger cursor (`IndexerState`, id=1) is persisted
 *    *after* a batch fully processes and *before* the loop advances. We never
 *    move the cursor ahead of what we have durably stored, so a restart resumes
 *    from the first un-indexed ledger and re-fetches — which is safe because of
 *    the upsert above.
 *  * **Dead-letter queue.** Events that cannot be parsed, or whose handler keeps
 *    failing after 3 retries, are pushed to the Redis list `indexer:dlq` with the
 *    original payload + error. The batch continues; one poison event can never
 *    stall the pipeline.
 *
 * ## Graceful shutdown
 *  `startIndexer()` registers SIGTERM/SIGINT handlers that set a flag and let the
 *  *current* batch finish, persist the cursor, then exit. We never abort a batch
 *  mid-flight.
 *
 * @module services/escrowIndexer
 */

import { createClient } from 'redis';
import { scValToNative } from '@stellar/stellar-sdk';
import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';
import { getLatestLedger, getContractEvents } from './stellarService.js';
import {
  fundEscrow,
  releaseMilestone,
  raiseDispute,
  resolveDispute,
  cancelEscrow,
  expireEscrow,
} from './escrowService.js';

const log = createModuleLogger('service.escrowIndexer');

const DEFAULT_TENANT = 'default';

// ─── Configuration ─────────────────────────────────────────────────────────────
const CONTRACT_ID = process.env.ESCROW_CONTRACT_ID || '';
const POLL_INTERVAL_MS = parseInt(process.env.INDEXER_POLL_INTERVAL_MS || '5000', 10);
const START_LEDGER = parseInt(process.env.INDEXER_START_LEDGER || '0', 10);

/** Redis list used as the dead-letter queue for poison events. */
export const DLQ_KEY = 'indexer:dlq';

// ─── Handler retry / backoff ────────────────────────────────────────────────────
const HANDLER_MAX_RETRIES = 3; // up to 3 re-attempts after the first failure
const HANDLER_BASE_DELAY_MS = 500; // exponential base: 500, 1000, 2000, …

// ─── Injected sleep (so tests can assert backoff without real waiting) ──────────
let _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Test hook: override the delay primitive. */
export function __setSleep(fn) {
  _sleep = fn;
}

/** Test hook: reset the in-memory cursor so batches start from a known ledger. */
export function __resetCursor(n = START_LEDGER) {
  cursor = n;
}

// ─── Runtime state ──────────────────────────────────────────────────────────────
let running = false;
let shuttingDown = false;
let cursor = 0; // last processed ledger (number)
let timer = null;

// ─── Redis DLQ client (lazy) ─────────────────────────────────────────────────────
let _redisClient = null;
function getRedisClient() {
  if (!_redisClient) {
    _redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    _redisClient.on('error', (err) => log.error({ message: 'redis_dql_error', error: err.message }));
  }
  return _redisClient;
}

/** Push a poison event to the dead-letter queue. Never throws. */
async function pushToDlq(event, error, kind, attempts = 0) {
  const entry = {
    event,
    error: error?.message ?? String(error),
    kind,
    attempts,
    at: new Date().toISOString(),
  };
  try {
    await getRedisClient().rpush(DLQ_KEY, JSON.stringify(entry));
  } catch (dlqErr) {
    log.error({ message: 'indexer_dlq_write_failed', error: dlqErr?.message });
  }
}

// ─── ScVal / value helpers ───────────────────────────────────────────────────────

/** Convert a Soroban ScVal (or plain value) to a native JS value. */
function toNative(value) {
  if (value == null) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  try {
    return scValToNative(value);
  } catch {
    return value;
  }
}

/** Extract the short event-type symbol from topic[0]. */
function parseEventType(topic0) {
  if (topic0 == null) return null;
  if (typeof topic0 === 'string') return topic0;
  if (typeof topic0 === 'object' && 'value' in topic0 && typeof topic0.value === 'function') {
    try {
      return String(topic0.value());
    } catch {
      /* fallthrough */
    }
  }
  try {
    return String(scValToNative(topic0));
  } catch {
    return String(topic0);
  }
}

/**
 * Parse a raw Soroban event into `{ type, escrowId, value, handlerArgs }`.
 * Throws on a malformed event (missing topic, unparsable escrow id, …) so the
 * caller can route it to the DLQ.
 */
function parseEvent(event) {
  if (!event || !Array.isArray(event.topic) || event.topic.length === 0) {
    throw new Error('Malformed event: missing topic');
  }

  const type = parseEventType(event.topic[0]);
  if (!type) throw new Error('Malformed event: missing event type in topic[0]');

  const escrowIdRaw = event.topic[1] != null ? toNative(event.topic[1]) : null;
  const escrowId = escrowIdRaw != null ? BigInt(escrowIdRaw) : null;

  const value = Array.isArray(event.value)
    ? event.value.map(toNative)
    : event.value != null
      ? [toNative(event.value)]
      : [];

  return { type, escrowId, value, handlerArgs: buildHandlerArgs(type, escrowId, value, event) };
}

/** Map a parsed event to the argument shape its escrowService handler expects. */
function buildHandlerArgs(type, escrowId, value, event) {
  switch (type) {
    case 'EscrowCreated':
      return {
        id: escrowId,
        clientAddress: value[0],
        freelancerAddress: value[1],
        tokenAddress: value[2],
        totalAmount: value[3],
        briefHash: value[4] ?? '',
        arbiterAddress: value[5] ?? null,
        createdLedger: event.ledger,
      };
    case 'MilestoneApproved':
      return {
        escrowId,
        milestoneIndex: value[0] != null ? Number(value[0]) : undefined,
        amount: value[1],
        callerAddress: value[2],
        referenceId: event.txHash ?? String(escrowId),
      };
    case 'DisputeRaised':
      return {
        escrowId,
        raisedByAddress: value[0],
        milestoneIndex: value[1] != null ? Number(value[1]) : undefined,
      };
    case 'DisputeResolved':
      return {
        escrowId,
        clientAmount: value[0],
        freelancerAmount: value[1],
        resolvedBy: value[2],
        resolution: value[3],
        referenceId: event.txHash ?? String(escrowId),
      };
    case 'EscrowCancelled':
      return {
        escrowId,
        cancelledBy: value[0],
        reason: value[1],
        referenceId: event.txHash ?? String(escrowId),
      };
    case 'LockTimeExpired':
      return {
        escrowId,
        expiredLedger: event.ledger,
        referenceId: event.txHash ?? String(escrowId),
      };
    default:
      return { escrowId };
  }
}

// ─── Event → handler dispatch ─────────────────────────────────────────────────────
const HANDLERS = {
  EscrowCreated: fundEscrow,
  MilestoneApproved: releaseMilestone,
  DisputeRaised: raiseDispute,
  DisputeResolved: resolveDispute,
  EscrowCancelled: cancelEscrow,
  LockTimeExpired: expireEscrow,
};

// ─── Idempotent event storage ─────────────────────────────────────────────────────

/**
 * Record an event exactly once. The upsert key is the globally-unique Soroban
 * `event.id`; a replay resolves to the `update` branch and leaves the existing
 * row untouched.
 */
async function upsertContractEvent(event, parsed) {
  let eventIndex = 0;
  const idStr = String(event.id ?? '');
  const tail = idStr.split('-').pop();
  if (tail && /^\d+$/.test(tail)) eventIndex = parseInt(tail, 10);

  await prisma.contractEvent.upsert({
    where: { eventId: idStr },
    create: {
      tenantId: DEFAULT_TENANT,
      eventId: idStr,
      ledger: BigInt(event.ledger),
      ledgerAt: event.ledgerClosedAt ? new Date(event.ledgerClosedAt) : new Date(),
      contractId: event.contractId ?? CONTRACT_ID,
      eventType: parsed.type,
      escrowId: parsed.escrowId,
      topics: JSON.parse(JSON.stringify(event.topic ?? [])),
      data: JSON.parse(JSON.stringify(parsed.value ?? [])),
      txHash: event.txHash ?? '',
      eventIndex,
    },
    update: {},
  });
}

// ─── Handler invocation with bounded retry ─────────────────────────────────────────

/**
 * Invoke `fn` with up to `maxRetries` retries using an exponential backoff
 * (500ms base). Re-throws the last error if every attempt fails so the caller
 * can dead-letter the event.
 */
async function invokeWithRetry(fn, maxRetries = HANDLER_MAX_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await _sleep(HANDLER_BASE_DELAY_MS * 2 ** attempt);
      }
    }
  }
  throw lastError;
}

// ─── Per-event processing ───────────────────────────────────────────────────────────

/**
 * Process a single raw Soroban event:
 *   1. Parse (parse failure → DLQ, continue).
 *   2. Upsert the contract event (idempotent).
 *   3. Dispatch to the matching escrowService handler, retrying on failure.
 *      Final failure → DLQ.
 *
 * @param {object} event - raw event from SorobanRpc.Server.getEvents()
 * @returns {Promise<void>}
 */
export async function processEvent(event) {
  let parsed;
  try {
    parsed = parseEvent(event);
  } catch (err) {
    log.warn({ message: 'indexer_parse_failed', error: err.message });
    await pushToDlq(event, err, 'parse');
    return;
  }

  await upsertContractEvent(event, parsed);

  const handler = HANDLERS[parsed.type];
  if (!handler) {
    log.warn({ message: 'indexer_unknown_event_type', type: parsed.type });
    return;
  }

  try {
    await invokeWithRetry(() => handler(parsed.handlerArgs));
  } catch (err) {
    log.error({
      message: 'indexer_handler_failed',
      type: parsed.type,
      escrowId: String(parsed.escrowId),
      error: err.message,
    });
    await pushToDlq(event, err, 'handler', HANDLER_MAX_RETRIES);
  }
}

/** Process an array of events in order. */
export async function processBatch(events) {
  for (const event of events) {
    await processEvent(event);
  }
}

// ─── Cursor management ─────────────────────────────────────────────────────────────

/** Load the resume cursor: IndexerState row (id=1) or INDEXER_START_LEDGER. */
export async function loadCursor() {
  const state = await prisma.indexerState.upsert({
    where: { id: 1 },
    create: { id: 1, lastProcessedLedger: BigInt(START_LEDGER) },
    update: {},
  });
  return Number(state.lastProcessedLedger);
}

/** Persist the cursor. Called only after a batch has been fully processed. */
export async function persistCursor(ledger) {
  await prisma.indexerState.update({
    where: { id: 1 },
    data: { lastProcessedLedger: BigInt(ledger) },
  });
}

// ─── Batch loop ─────────────────────────────────────────────────────────────────────

/**
 * Fetch everything newer than `cursor` and process it, then advance + persist the
 * cursor. Returns the new cursor.
 */
export async function runBatch() {
  if (!CONTRACT_ID) {
    log.warn({ message: 'indexer_contract_id_unset' });
    return cursor;
  }

  const latest = await getLatestLedger();
  if (latest > cursor) {
    const events = await getContractEvents(cursor + 1, CONTRACT_ID);
    for (const event of events) {
      await processEvent(event);
    }
    cursor = latest;
    await persistCursor(cursor);
    log.info({ message: 'indexer_batch_processed', count: events.length, cursor });
  }
  return cursor;
}

/** Run a single batch (one iteration). Convenience for tests and one-shot runs. */
export async function runOnce() {
  return runBatch();
}

async function tick() {
  if (!running) return;
  try {
    await runBatch();
  } catch (err) {
    log.error({ message: 'indexer_batch_error', error: err?.message, stack: err?.stack });
  }

  if (running && !shuttingDown) {
    timer = setTimeout(tick, POLL_INTERVAL_MS);
  } else if (shuttingDown) {
    try {
      await persistCursor(cursor);
    } catch (err) {
      log.error({ message: 'indexer_shutdown_persist_failed', error: err?.message });
    }
    log.info({ message: 'indexer_shutdown_complete', cursor });
    // Never exit mid-batch; only leave once the in-flight batch has committed.
    if (!process.env.JEST_WORKER_ID) process.exit(0);
  }
}

function registerSignals() {
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ message: 'indexer_shutdown_signal_received' });
    // The in-flight batch finishes, then `tick` persists + exits.
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// ─── Public lifecycle ───────────────────────────────────────────────────────────────

/**
 * Start the polling loop. Loads the cursor, registers shutdown handlers, and runs
 * the first batch immediately, then schedules subsequent batches.
 */
export async function startIndexer() {
  if (running) return;
  running = true;
  shuttingDown = false;
  cursor = await loadCursor();
  log.info({ message: 'indexer_started', cursor });
  if (!process.env.JEST_WORKER_ID) registerSignals();
  await tick();
}

/** Stop scheduling new batches. The in-flight batch is allowed to complete. */
export function stopIndexer() {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  log.info({ message: 'indexer_stopped' });
}

/** Return the last successfully processed ledger sequence number, or null if not started. */
export function getLastProcessedLedger() {
  return cursor > 0 ? cursor : null;
}

export default {
  startIndexer,
  stopIndexer,
  getLastProcessedLedger,
  runOnce,
  runBatch,
  processEvent,
  processBatch,
  loadCursor,
  persistCursor,
  DLQ_KEY,
  __setSleep,
  __resetCursor,
};
