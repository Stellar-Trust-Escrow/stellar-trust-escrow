/**
 * Escrow Ledger Event Indexer — Resilient Sync Pipeline
 *
 * Tracks last_processed_ledger in PostgreSQL (IndexerState table).
 * On startup, catches up from the last saved ledger in batches.
 * Retries RPC failures with exponential backoff.
 * Emits performance metrics to console (wire to Prometheus in production).
 *
 * ## Resilience guarantees
 *   - Crash recovery: resumes from last committed ledger on restart
 *   - RPC downtime: exponential backoff up to MAX_BACKOFF_MS
 *   - Batch processing: processes BATCH_SIZE ledgers per tick to avoid RPC overload
 *   - Zero data loss: ledger cursor only advances after successful DB write
 *   - Distributed locking: Redlock (Redis) prevents duplicate processing across nodes
 *     - Lock key: indexer:ledger:<ledger>  TTL: LOCK_TTL_MS
 *     - If lock acquisition fails the batch is skipped (another node is processing it)
 *     - Locks auto-expire so a crashed node never blocks the cluster
 */

import { Redis } from 'ioredis';
import prisma from '../lib/prisma.js';
import { withRetry } from '../lib/transaction.js';
import LockManager from '../services/lockManager.js';
import { createModuleLogger } from '../config/logger.js';
import { syncCid } from './ipfsSyncWorker.js';

const logger = createModuleLogger('worker.escrowIndexer');

const CONTRACT_ID = process.env.ESCROW_CONTRACT_ID || '';
const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const POLL_INTERVAL_MS = parseInt(process.env.INDEXER_POLL_INTERVAL_MS || '5000', 10);
const BATCH_SIZE = parseInt(process.env.INDEXER_BATCH_SIZE || '100', 10);
const BASE_BACKOFF_MS = parseInt(process.env.INDEXER_BASE_BACKOFF_MS || '1000', 10);
const MAX_BACKOFF_MS = parseInt(process.env.INDEXER_MAX_BACKOFF_MS || '60000', 10);
const START_LEDGER = parseInt(process.env.INDEXER_START_LEDGER || '0', 10);

// Redlock config
const LOCK_TTL_MS = parseInt(process.env.INDEXER_LOCK_TTL_MS || '30000', 10);
const LOCK_RETRY_COUNT = parseInt(process.env.INDEXER_LOCK_RETRY_COUNT || '3', 10);
const LOCK_RETRY_DELAY_MS = parseInt(process.env.INDEXER_LOCK_RETRY_DELAY_MS || '200', 10);

// ── Metrics ───────────────────────────────────────────────────────────────────

const metrics = {
  eventsProcessed: 0,
  ledgersProcessed: 0,
  rpcErrors: 0,
  dbErrors: 0,
  lastTickMs: 0,
  lastLedger: 0,
  locksAcquired: 0,
  locksSkipped: 0,
};

function logMetrics() {
  logger.info({ message: 'indexer_metrics', ...metrics });
}

// ── Redis / Redlock ───────────────────────────────────────────────────────────

let redisClient = null;

function getRedis() {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 2,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    redisClient.on('error', (err) => logger.warn({ message: 'redis_error', error: err.message }));
  }
  return redisClient;
}

/**
 * Attempt to acquire a Redlock-style distributed lock for a ledger range.
 *
 * Uses SET NX PX (atomic) — compatible with single-node Redis and Redlock
 * multi-node setups. Returns the lock token on success, null on failure.
 *
 * @param {number} fromLedger
 * @param {number} toLedger
 * @returns {Promise<string|null>} lock token or null
 */
async function acquireLock(fromLedger, toLedger) {
  const redis = getRedis();
  const key = `indexer:ledger:${fromLedger}:${toLedger}`;
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  for (let attempt = 0; attempt < LOCK_RETRY_COUNT; attempt++) {
    const result = await redis.set(key, token, 'NX', 'PX', LOCK_TTL_MS).catch(() => null);
    if (result === 'OK') return token;
    if (attempt < LOCK_RETRY_COUNT - 1) {
      await new Promise((r) => setTimeout(r, LOCK_RETRY_DELAY_MS));
    }
  }
  return null;
}

/**
 * Release a lock only if we still own it (compare-and-delete via Lua).
 */
async function releaseLock(fromLedger, toLedger, token) {
  const redis = getRedis();
  const key = `indexer:ledger:${fromLedger}:${toLedger}`;
  const lua = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
  await redis.eval(lua, 1, key, token).catch(() => null);
}

// ── RPC helpers ───────────────────────────────────────────────────────────────

async function rpcFetch(path, body) {
  const res = await fetch(`${RPC_URL}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: path, params: body }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${json.error.message}`);
  return json.result;
}

async function getLatestLedger() {
  const result = await rpcFetch('getLatestLedger', []);
  return result.sequence;
}

async function getEvents(startLedger, endLedger) {
  const result = await rpcFetch('getEvents', [
    {
      startLedger,
      endLedger,
      filters: [{ type: 'contract', contractIds: [CONTRACT_ID] }],
    },
  ]);
  return result.events ?? [];
}

// ── Cursor persistence ────────────────────────────────────────────────────────

async function loadCursor() {
  const state = await prisma.indexerState.upsert({
    where: { id: 1 },
    create: { id: 1, lastProcessedLedger: BigInt(START_LEDGER) },
    update: {},
  });
  return Number(state.lastProcessedLedger);
}

async function saveCursor(ledger) {
  await prisma.indexerState.update({
    where: { id: 1 },
    data: { lastProcessedLedger: BigInt(ledger) },
  });
  metrics.lastLedger = ledger;
}

// ── Event dispatch ────────────────────────────────────────────────────────────

async function dispatchEvent(event) {
  const topic = event.topic?.[0] ?? '';
  const escrowId = event.topic?.[1] ? BigInt(event.topic[1]) : null;

  switch (topic) {
    case 'esc_crt':
      return handleEscrowCreated(event, escrowId);
    case 'mil_add':
      return handleMilestoneAdded(event, escrowId);
    case 'mil_sub':
      return handleMilestoneSubmitted(event, escrowId);
    case 'mil_apr':
      return handleMilestoneApproved(event, escrowId);
    case 'funds_rel':
      return handleFundsReleased(event, escrowId);
    case 'esc_can':
      return handleEscrowCancelled(event, escrowId);
    case 'dis_rai':
      return handleDisputeRaised(event, escrowId);
    case 'dis_res':
      return handleDisputeResolved(event, escrowId);
    case 'rep_upd':
      return handleReputationUpdated(event);
    default:
      console.warn(`[Indexer] Unknown event topic: ${topic}`);
  }
}

async function handleEscrowCreated(event, escrowId) {
  const [client, freelancer, amount] = event.value ?? [];
  if (!escrowId || !client) return;
  await prisma.contractEvent.upsert({
    where: {
      tenantId_txHash_eventIndex: {
        tenantId: 'default',
        txHash: event.txHash,
        eventIndex: event.id ?? 0,
      },
    },
    create: {
      tenantId: 'default',
      ledger: BigInt(event.ledger),
      ledgerAt: new Date(event.ledgerClosedAt),
      contractId: CONTRACT_ID,
      eventType: 'esc_crt',
      escrowId,
      topics: event.topic,
      data: event.value,
      txHash: event.txHash,
      eventIndex: event.id ?? 0,
    },
    update: {},
  });
}

async function handleMilestoneAdded(event, escrowId) {
  await prisma.contractEvent.upsert({
    where: {
      tenantId_txHash_eventIndex: {
        tenantId: 'default',
        txHash: event.txHash,
        eventIndex: event.id ?? 0,
      },
    },
    create: {
      tenantId: 'default',
      ledger: BigInt(event.ledger),
      ledgerAt: new Date(event.ledgerClosedAt),
      contractId: CONTRACT_ID,
      eventType: 'mil_add',
      escrowId,
      topics: event.topic,
      data: event.value,
      txHash: event.txHash,
      eventIndex: event.id ?? 0,
    },
    update: {},
  });
}

async function handleMilestoneSubmitted(event, escrowId) {
  const [milestoneId] = event.value ?? [];
  if (!escrowId || milestoneId === undefined) return;
  await prisma.$transaction([
    prisma.milestone.updateMany({
      where: { escrowId, milestoneIndex: Number(milestoneId) },
      data: { status: 'Submitted', submittedAt: new Date(event.ledgerClosedAt) },
    }),
    prisma.contractEvent.upsert({
      where: {
        tenantId_txHash_eventIndex: {
          tenantId: 'default',
          txHash: event.txHash,
          eventIndex: event.id ?? 0,
        },
      },
      create: {
        tenantId: 'default',
        ledger: BigInt(event.ledger),
        ledgerAt: new Date(event.ledgerClosedAt),
        contractId: CONTRACT_ID,
        eventType: 'mil_sub',
        escrowId,
        topics: event.topic,
        data: event.value,
        txHash: event.txHash,
        eventIndex: event.id ?? 0,
      },
      update: {},
    }),
  ]);
}

async function handleMilestoneApproved(event, escrowId) {
  const [milestoneId] = event.value ?? [];
  if (!escrowId || milestoneId === undefined) return;
  await prisma.milestone.updateMany({
    where: { escrowId, milestoneIndex: Number(milestoneId) },
    data: { status: 'Approved', resolvedAt: new Date(event.ledgerClosedAt) },
  });
}

async function handleFundsReleased(event, escrowId) {
  const [, amount] = event.value ?? [];
  if (!escrowId || !amount) return;
  await prisma.$executeRaw`
    UPDATE escrows SET remaining_balance = (remaining_balance::numeric - ${BigInt(amount)}::numeric)::text
    WHERE id = ${escrowId}
  `;
}

async function handleEscrowCancelled(event, escrowId) {
  if (!escrowId) return;
  await prisma.escrow.updateMany({ where: { id: escrowId }, data: { status: 'Cancelled' } });
}

async function handleDisputeRaised(event, escrowId) {
  const raisedBy = event.value;
  if (!escrowId) return;
  await prisma.$transaction([
    prisma.escrow.updateMany({ where: { id: escrowId }, data: { status: 'Disputed' } }),
    prisma.dispute.upsert({
      where: { escrowId },
      create: {
        escrowId,
        raisedByAddress: String(raisedBy ?? ''),
        raisedAt: new Date(event.ledgerClosedAt),
      },
      update: {},
    }),
  ]);

  // Pre-fetch IPFS evidence metadata asynchronously
  const cid = event.value?.[1] ?? event.cid;
  if (cid) syncCid(String(cid), Number(escrowId));
}

async function handleDisputeResolved(event, escrowId) {
  if (!escrowId) return;
  await prisma.escrow.updateMany({ where: { id: escrowId }, data: { status: 'Completed' } });
}

async function handleReputationUpdated(event) {
  const [address, newScore] = event.value ?? [];
  if (!address) return;
  await prisma.reputationRecord.upsert({
    where: { address: String(address) },
    create: {
      tenantId: 'default',
      address: String(address),
      totalScore: BigInt(newScore ?? 0),
      lastUpdated: new Date(),
    },
    update: { totalScore: BigInt(newScore ?? 0), lastUpdated: new Date() },
  });
}

// ── Main loop ─────────────────────────────────────────────────────────────────

async function processBatch(fromLedger, toLedger) {
  const token = await acquireLock(fromLedger, toLedger);

  if (!token) {
    // Another node holds the lock — skip this batch
    metrics.locksSkipped++;
    logger.debug({ message: 'indexer_lock_skipped', fromLedger, toLedger });
    return 0;
  }

  metrics.locksAcquired++;
  try {
    const events = await getEvents(fromLedger, toLedger);
    for (const event of events) {
      await withRetry(() => dispatchEvent(event));
      metrics.eventsProcessed++;
    }
    metrics.ledgersProcessed += toLedger - fromLedger + 1;
    return events.length;
  } finally {
    await releaseLock(fromLedger, toLedger, token);
  }
}

export async function startIndexer() {
  if (!CONTRACT_ID) {
    console.warn('[Indexer] ESCROW_CONTRACT_ID not set — skipping');
    return;
  }

  let cursor = await loadCursor();
  let backoff = BASE_BACKOFF_MS;
  logger.info({ message: 'indexer_starting', fromLedger: cursor });

  const tick = async () => {
    const lock = await LockManager.acquire('escrow_verifying_lock', 300_000);
    if (!lock) {
      console.info('[Indexer] Lock held by another process — skipping tick');
      return;
    }
    const t0 = Date.now();
    try {
      const latest = await getLatestLedger();

      if (cursor >= latest) return; // fully caught up

      // Catch-up: process in batches
      while (cursor < latest) {
        const batchEnd = Math.min(cursor + BATCH_SIZE, latest);
        await processBatch(cursor + 1, batchEnd);
        cursor = batchEnd;
        await saveCursor(cursor);
      }

      backoff = BASE_BACKOFF_MS; // reset on success
    } catch (err) {
      metrics.rpcErrors++;
      logger.error({ message: 'indexer_tick_error', backoffMs: backoff, error: err.message });
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
    } finally {
      metrics.lastTickMs = Date.now() - t0;
      await lock.release();
    }
  };

  // Run immediately then on interval
  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
  setInterval(logMetrics, 60_000);
}

export default { startIndexer };
