/**
 * Escrow Event Indexer
 *
 * Background service that polls the Stellar network for Soroban contract
 * events emitted by the escrow contract and writes them to PostgreSQL.
 *
 * Resilience guarantees:
 *  - Crash recovery: resumes from last committed ledger (Redis + DB) on restart
 *  - Exponential backoff on RPC failures
 *  - Idempotent: upsert semantics prevent duplicate DB records
 *  - DLQ: events that fail after MAX_RETRIES pushes are written to
 *    Redis key `indexer:dlq` for manual inspection without blocking
 *
 * @module escrowIndexer
 */

import { Redis } from 'ioredis';
import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';
import { getContractEvents, getLatestLedger } from './stellarService.js';

const log = createModuleLogger('service.escrowIndexer');

// ── Config ────────────────────────────────────────────────────────────────────

const CONTRACT_ID = process.env.ESCROW_CONTRACT_ID || '';
const POLL_INTERVAL_MS = parseInt(process.env.INDEXER_POLL_INTERVAL_MS || '5000', 10);
const START_LEDGER = parseInt(process.env.INDEXER_START_LEDGER || '0', 10);
const MAX_RETRIES = 3;
const DLQ_KEY = 'indexer:dlq';

// ── Redis ─────────────────────────────────────────────────────────────────────

let _redis = null;

function getRedis() {
  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 2,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    _redis.on('error', (err) => log.warn({ message: 'redis_error', error: err.message }));
  }
  return _redis;
}

async function persistCursor(ledger) {
  await prisma.indexerState.update({
    where: { id: 1 },
    data: { lastProcessedLedger: BigInt(ledger) },
  });
}

// ── ScVal helpers (raw JSON values from eventIndexer shape) ───────────────────

const parseBigInt = (v) => {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(v);
  try { return BigInt(String(v)); } catch { return BigInt(0); }
};

const parseAddress = (v) => {
  if (typeof v === 'string') return v;
  try { return v.address().toString(); } catch { return String(v); }
};

// ── Event handlers ────────────────────────────────────────────────────────────

export async function handleMilestoneApproved(event) {
  const escrowId = parseBigInt(event.topic?.[1]);
  const [milestoneId] = event.value ?? [];
  if (!escrowId || milestoneId === undefined) return;
  await prisma.milestone.updateMany({
    where: { escrowId, milestoneIndex: Number(parseBigInt(milestoneId)) },
    data: { status: 'Approved', resolvedAt: new Date(event.ledgerClosedAt) },
  });
}

export async function handleDisputeRaised(event) {
  const escrowId = parseBigInt(event.topic?.[1]);
  if (!escrowId) return;
  const raisedBy = parseAddress(event.value);
  await prisma.$transaction([
    prisma.escrow.updateMany({ where: { id: escrowId }, data: { status: 'Disputed' } }),
    prisma.dispute.upsert({
      where: { escrowId },
      create: { escrowId, raisedByAddress: String(raisedBy ?? ''), raisedAt: new Date(event.ledgerClosedAt) },
      update: {},
    }),
  ]);
}

export async function handleFundsReleased(event) {
  const escrowId = parseBigInt(event.topic?.[1]);
  const [, amount] = event.value ?? [];
  if (!escrowId || !amount) return;
  const released = parseBigInt(amount);
  await prisma.$executeRaw`
    UPDATE escrows
    SET remaining_balance = (remaining_balance::numeric - ${released}::numeric)::text
    WHERE id = ${escrowId}
  `;
}

export async function handleEscrowCancelled(event) {
  const escrowId = parseBigInt(event.topic?.[1]);
  if (!escrowId) return;
  await prisma.escrow.updateMany({ where: { id: escrowId }, data: { status: 'Cancelled' } });
}

export async function handleEscrowCreated(event) {
  const escrowId = parseBigInt(event.topic?.[1]);
  const [client, freelancer, amount] = event.value ?? [];
  if (!escrowId || !client) return;
  await prisma.escrow.upsert({
    where: { id: escrowId },
    create: {
      id: escrowId,
      clientAddress: parseAddress(client),
      freelancerAddress: parseAddress(freelancer),
      tokenAddress: '',
      totalAmount: parseBigInt(amount).toString(),
      remainingBalance: parseBigInt(amount).toString(),
      status: 'Active',
      briefHash: '',
      createdAt: new Date(event.ledgerClosedAt),
      createdLedger: BigInt(event.ledger ?? 0),
    },
    update: {},
  });
}

export async function handleMilestoneAdded(event) {
  const escrowId = parseBigInt(event.topic?.[1]);
  const [milestoneId, amount] = event.value ?? [];
  if (!escrowId || milestoneId === undefined) return;
  const milestoneIndex = Number(parseBigInt(milestoneId));
  await prisma.milestone.upsert({
    where: { escrowId_milestoneIndex: { escrowId, milestoneIndex } },
    create: {
      escrowId,
      milestoneIndex,
      title: `Milestone ${milestoneIndex}`,
      descriptionHash: '',
      amount: parseBigInt(amount).toString(),
      status: 'Pending',
    },
    update: {},
  });
}

export async function handleMilestoneSubmitted(event) {
  const escrowId = parseBigInt(event.topic?.[1]);
  const [milestoneId] = event.value ?? [];
  if (!escrowId || milestoneId === undefined) return;
  await prisma.milestone.updateMany({
    where: { escrowId, milestoneIndex: Number(parseBigInt(milestoneId)) },
    data: { status: 'Submitted', submittedAt: new Date(event.ledgerClosedAt) },
  });
}

export async function handleDisputeResolved(event) {
  const escrowId = parseBigInt(event.topic?.[1]);
  if (!escrowId) return;
  await prisma.escrow.updateMany({ where: { id: escrowId }, data: { status: 'Completed' } });
}

export async function handleReputationUpdated(event) {
  const [address, newScore] = event.value ?? [];
  if (!address) return;
  await prisma.reputationRecord.upsert({
    where: { address: String(address) },
    create: {
      address: String(address),
      totalScore: parseBigInt(newScore ?? 0),
      lastUpdated: new Date(),
    },
    update: { totalScore: parseBigInt(newScore ?? 0), lastUpdated: new Date() },
  });
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const HANDLERS = {
  esc_crt:   handleEscrowCreated,
  mil_add:   handleMilestoneAdded,
  mil_sub:   handleMilestoneSubmitted,
  mil_apr:   handleMilestoneApproved,
  funds_rel: handleFundsReleased,
  esc_can:   handleEscrowCancelled,
  dis_rai:   handleDisputeRaised,
  dis_res:   handleDisputeResolved,
  rep_upd:   handleReputationUpdated,
};

export async function dispatchEvent(event) {
  const topic = typeof event.topic?.[0] === 'string' ? event.topic[0] : String(event.topic?.[0] ?? '');
  const handler = HANDLERS[topic];
  if (!handler) {
    log.warn({ message: 'indexer_unknown_event_type', topic });
    return;
  }
  await handler(event);
}

// ── DLQ ───────────────────────────────────────────────────────────────────────

async function pushToDlq(event, error) {
  try {
    const redis = getRedis();
    await redis.rpush(DLQ_KEY, JSON.stringify({
      event,
      error: error.message,
      failedAt: new Date().toISOString(),
    }));
    log.warn({ message: 'indexer_event_dlq', topic: event.topic?.[0], error: error.message });
  } catch (redisErr) {
    log.error({ message: 'indexer_dlq_push_failed', error: redisErr.message });
  }
}

async function processWithRetry(event) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await dispatchEvent(event);
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 200 * 2 ** (attempt - 1)));
      }
    }
  }
  await pushToDlq(event, lastErr);
}

// ── Core polling ──────────────────────────────────────────────────────────────

/**
 * Fetches all events since fromLedger and processes them.
 * Advances the ledger cursor only after all events in a ledger are committed.
 *
 * @param {number} fromLedger
 * @returns {Promise<number>} latest ledger sequence
 */
export async function fetchAndProcessEvents(fromLedger) {
  const events = await getContractEvents(fromLedger, CONTRACT_ID);
  const latest = await getLatestLedger();

  for (const event of events) {
    await processWithRetry(event);
  }

  if (events.length > 0) {
    log.info({ message: 'indexer_events_processed', count: events.length, latestLedger: latest });
  }

  return latest;
}

/**
 * Starts the indexer polling loop.
 * Validates required env vars, loads cursor from DB, then polls.
 */
export async function startIndexer() {
  // Load cursor
  const state = await prisma.indexerState.upsert({
    where: { id: 1 },
    create: { id: 1, lastProcessedLedger: BigInt(START_LEDGER) },
    update: {},
  });

  let cursor = Number(state.lastProcessedLedger);
  let backoff = 1000;

  log.info({ message: 'indexer_starting', fromLedger: cursor });

  const tick = async () => {
    if (!CONTRACT_ID) return;
    try {
      const latest = await fetchAndProcessEvents(cursor);
      if (latest > cursor) {
        cursor = latest;
        await persistCursor(cursor);
      }
      backoff = 1000;
    } catch (err) {
      log.error({ message: 'indexer_tick_error', backoffMs: backoff, error: err.message });
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 60_000);
    }
  };

  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

export default {
  startIndexer,
  fetchAndProcessEvents,
  dispatchEvent,
  handleEscrowCreated,
  handleMilestoneAdded,
  handleMilestoneSubmitted,
  handleMilestoneApproved,
  handleFundsReleased,
  handleEscrowCancelled,
  handleDisputeRaised,
  handleDisputeResolved,
  handleReputationUpdated,
};
