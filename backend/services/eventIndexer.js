/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Smart Contract Event Indexer
 *
 * Polls the Stellar network for Soroban contract events emitted by the escrow
 * contract and writes them to PostgreSQL, keeping the database in sync so the
 * REST API can serve historical data without querying the chain on every request.
 *
 * ## Event → DB Mapping
 *
 * | Contract Event      | event_type  | DB Side-Effect                          |
 * |---------------------|-------------|-----------------------------------------|
 * | EscrowCreated       | esc_crt     | INSERT escrows + ContractEvent          |
 * | MilestoneAdded      | mil_add     | INSERT milestones + ContractEvent       |
 * | MilestoneSubmitted  | mil_sub     | UPDATE milestone status + ContractEvent |
 * | MilestoneApproved   | mil_apr     | UPDATE milestone status + ContractEvent |
 * | MilestoneRejected   | mil_rej     | UPDATE milestone status + ContractEvent |
 * | MilestoneDisputed   | mil_dis     | UPDATE milestone status + ContractEvent |
 * | FundsReleased       | funds_rel   | UPDATE escrow balance + ContractEvent   |
 * | EscrowCancelled     | esc_can     | UPDATE escrow status + ContractEvent    |
 * | DisputeRaised       | dis_rai     | INSERT/UPDATE dispute + ContractEvent   |
 * | DisputeResolved     | dis_res     | UPDATE dispute + ContractEvent          |
 * | ReputationUpdated   | rep_upd     | UPSERT reputation_records + ContractEvent|
 *
 * @module eventIndexer
 */

import prisma from '../lib/prisma.js';
import { getContractEvents, getLatestLedger } from './stellarService.js';
import { withSpan, getTracer } from '../lib/tracing.js';

const CONTRACT_ID = process.env.ESCROW_CONTRACT_ID || '';
const POLL_INTERVAL_MS = parseInt(process.env.INDEXER_POLL_INTERVAL_MS || '5000', 10);

// ─── XDR / value helpers ──────────────────────────────────────────────────────

/**
 * Converts a Soroban ScVal to a plain JS value for storage.
 * The Stellar SDK exposes a `.value()` helper on ScVal objects.
 */
const scValToJs = (scVal) => {
  if (scVal == null) return null;
  try {
    // SDK v12 exposes scValToNative
    const { scValToNative } = require('@stellar/stellar-sdk');
    return scValToNative(scVal);
  } catch {
    // Fallback: return raw string representation
    return String(scVal);
  }
};

/** Safely serialise a value that may contain BigInt for JSON storage. */
const toJson = (value) =>
  JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

/**
 * Extracts the short symbol string from a Soroban Symbol ScVal topic.
 * The SDK represents symbol_short values as plain strings after decoding.
 */
const parseEventType = (topic0) => {
  if (typeof topic0 === 'string') return topic0;
  if (topic0?.value) return String(topic0.value());
  return String(topic0);
};

/** Converts a Soroban Address ScVal to a Stellar address string. */
const parseAddress = (scVal) => {
  if (typeof scVal === 'string') return scVal;
  try {
    return scVal.address().toString();
  } catch {
    return String(scVal);
  }
};

/** Converts a Soroban i128 / u64 ScVal to a BigInt. */
const parseBigInt = (scVal) => {
  if (typeof scVal === 'bigint') return scVal;
  if (typeof scVal === 'number') return BigInt(scVal);
  try {
    return BigInt(scVal.value().toString());
  } catch {
    return BigInt(String(scVal));
  }
};

// ─── Event handlers ───────────────────────────────────────────────────────────

/**
 * Handles esc_crt — inserts a new escrow row.
 * topic: (esc_crt, escrow_id)
 * data:  (client, freelancer, amount)
 */
const handleEscrowCreated = async (event, meta) => {
  const escrowId = parseBigInt(event.topic[1]);
  const [client, freelancer, amount] = event.value;

  await prisma.$transaction([
    prisma.escrow.upsert({
      where: { id: escrowId },
      create: {
        id: escrowId,
        clientAddress: parseAddress(client),
        freelancerAddress: parseAddress(freelancer),
        tokenAddress: '', // populated by a later getEscrow call or separate event
        totalAmount: parseBigInt(amount).toString(),
        remainingBalance: parseBigInt(amount).toString(),
        status: 'Active',
        briefHash: '',
        createdAt: meta.ledgerAt,
        createdLedger: meta.ledger,
      },
      update: {}, // don't overwrite if already indexed
    }),
    buildEventInsert(event, meta, escrowId),
  ]);
};

/**
 * Handles mil_add — inserts a new milestone row.
 * topic: (mil_add, escrow_id)
 * data:  (milestone_id, amount)
 */
const handleMilestoneAdded = async (event, meta) => {
  const escrowId = parseBigInt(event.topic[1]);
  const [milestoneId, amount] = event.value;
  const milestoneIndex = Number(parseBigInt(milestoneId));

  await prisma.$transaction([
    prisma.milestone.upsert({
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
    }),
    buildEventInsert(event, meta, escrowId),
  ]);
};

/**
 * Handles mil_sub — marks milestone as Submitted.
 * topic: (mil_sub, escrow_id)
 * data:  (milestone_id, freelancer)
 */
const handleMilestoneSubmitted = async (event, meta) => {
  const escrowId = parseBigInt(event.topic[1]);
  const [milestoneId] = event.value;
  const milestoneIndex = Number(parseBigInt(milestoneId));

  await prisma.$transaction([
    prisma.milestone.updateMany({
      where: { escrowId, milestoneIndex },
      data: { status: 'Submitted', submittedAt: meta.ledgerAt },
    }),
    buildEventInsert(event, meta, escrowId),
  ]);
};

/**
 * Handles mil_apr — marks milestone as Approved.
 * topic: (mil_apr, escrow_id)
 * data:  (milestone_id, amount)
 */
const handleMilestoneApproved = async (event, meta) => {
  const escrowId = parseBigInt(event.topic[1]);
  const [milestoneId] = event.value;
  const milestoneIndex = Number(parseBigInt(milestoneId));

  await prisma.$transaction([
    prisma.milestone.updateMany({
      where: { escrowId, milestoneIndex },
      data: { status: 'Approved', resolvedAt: meta.ledgerAt },
    }),
    buildEventInsert(event, meta, escrowId),
  ]);
};

/**
 * Handles mil_rej — marks milestone as Rejected.
 * topic: (mil_rej, escrow_id)
 * data:  (milestone_id, client)
 */
const handleMilestoneRejected = async (event, meta) => {
  const escrowId = parseBigInt(event.topic[1]);
  const [milestoneId] = event.value;
  const milestoneIndex = Number(parseBigInt(milestoneId));

  await prisma.$transaction([
    prisma.milestone.updateMany({
      where: { escrowId, milestoneIndex },
      data: { status: 'Rejected', resolvedAt: meta.ledgerAt },
    }),
    buildEventInsert(event, meta, escrowId),
  ]);
};

/**
 * Handles mil_dis — marks milestone as Disputed.
 * topic: (mil_dis, escrow_id)
 * data:  (milestone_id, raised_by)
 */
const handleMilestoneDisputed = async (event, meta) => {
  const escrowId = parseBigInt(event.topic[1]);
  const [milestoneId] = event.value;
  const milestoneIndex = Number(parseBigInt(milestoneId));

  await prisma.$transaction([
    prisma.milestone.updateMany({
      where: { escrowId, milestoneIndex },
      data: { status: 'Rejected' }, // MilestoneStatus.Disputed maps to Rejected in DB enum
    }),
    buildEventInsert(event, meta, escrowId),
  ]);
};

/**
 * Handles funds_rel — updates escrow remaining_balance.
 * topic: (funds_rel, escrow_id)
 * data:  (to, amount)
 */
const handleFundsReleased = async (event, meta) => {
  const escrowId = parseBigInt(event.topic[1]);
  const [, amount] = event.value;
  const released = parseBigInt(amount);

  // Decrement remaining_balance using raw SQL to avoid race conditions
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE escrows
      SET remaining_balance = (remaining_balance::numeric - ${released}::numeric)::text
      WHERE id = ${escrowId}
    `,
    buildEventInsert(event, meta, escrowId),
  ]);
};

/**
 * Handles esc_can — marks escrow as Cancelled.
 * topic: (esc_can, escrow_id)
 * data:  returned_amount
 */
const handleEscrowCancelled = async (event, meta) => {
  const escrowId = parseBigInt(event.topic[1]);

  await prisma.$transaction([
    prisma.escrow.updateMany({
      where: { id: escrowId },
      data: { status: 'Cancelled', updatedAt: meta.ledgerAt },
    }),
    buildEventInsert(event, meta, escrowId),
  ]);
};

/**
 * Handles dis_rai — creates a Dispute record and marks escrow as Disputed.
 * topic: (dis_rai, escrow_id)
 * data:  raised_by
 */
const handleDisputeRaised = async (event, meta) => {
  const escrowId = parseBigInt(event.topic[1]);
  const raisedBy = parseAddress(event.value);

  await prisma.$transaction([
    prisma.escrow.updateMany({
      where: { id: escrowId },
      data: { status: 'Disputed', updatedAt: meta.ledgerAt },
    }),
    prisma.dispute.upsert({
      where: { escrowId },
      create: {
        escrowId,
        raisedByAddress: raisedBy,
        raisedAt: meta.ledgerAt,
      },
      update: {},
    }),
    buildEventInsert(event, meta, escrowId),
  ]);
};

/**
 * Handles dis_res — resolves a dispute and marks escrow as Completed.
 * topic: (dis_res, escrow_id)
 * data:  (client_amount, freelancer_amount)
 */
const handleDisputeResolved = async (event, meta) => {
  const escrowId = parseBigInt(event.topic[1]);
  const [clientAmount, freelancerAmount] = event.value;

  await prisma.$transaction([
    prisma.escrow.updateMany({
      where: { id: escrowId },
      data: { status: 'Completed', updatedAt: meta.ledgerAt },
    }),
    prisma.dispute.updateMany({
      where: { escrowId },
      data: {
        resolvedAt: meta.ledgerAt,
        clientAmount: parseBigInt(clientAmount).toString(),
        freelancerAmount: parseBigInt(freelancerAmount).toString(),
      },
    }),
    buildEventInsert(event, meta, escrowId),
  ]);
};

/**
 * Handles rep_upd — upserts a reputation record.
 * topic: (rep_upd,)
 * data:  (address, new_score)
 */
const handleReputationUpdated = async (event, meta) => {
  const [address, newScore] = event.value;
  const addr = parseAddress(address);
  const score = parseBigInt(newScore);

  await prisma.$transaction([
    prisma.reputationRecord.upsert({
      where: { address: addr },
      create: {
        address: addr,
        totalScore: score,
        lastUpdated: meta.ledgerAt,
      },
      update: {
        totalScore: score,
        lastUpdated: meta.ledgerAt,
      },
    }),
    buildEventInsert(event, meta, null),
  ]);
};

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const HANDLERS = {
  esc_crt: handleEscrowCreated,
  mil_add: handleMilestoneAdded,
  mil_sub: handleMilestoneSubmitted,
  mil_apr: handleMilestoneApproved,
  mil_rej: handleMilestoneRejected,
  mil_dis: handleMilestoneDisputed,
  funds_rel: handleFundsReleased,
  esc_can: handleEscrowCancelled,
  dis_rai: handleDisputeRaised,
  dis_res: handleDisputeResolved,
  rep_upd: handleReputationUpdated,
};

/**
 * Routes a raw Soroban event to the correct handler.
 *
 * @param {object} rawEvent — event object from SorobanRpc.Server.getEvents()
 */
const dispatchEvent = async (rawEvent) => {
  const eventType = parseEventType(rawEvent.topic[0]);
  const handler = HANDLERS[eventType];

  if (!handler) {
    console.warn(`[Indexer] Unknown event type: ${eventType}`);
    return;
  }

  const meta = {
    ledger: BigInt(rawEvent.ledger),
    ledgerAt: new Date(rawEvent.ledgerClosedAt),
    txHash: rawEvent.txHash,
    eventIndex: rawEvent.id ? parseInt(rawEvent.id.split('-')[1] ?? '0', 10) : 0,
    contractId: rawEvent.contractId,
  };

  await withSpan(`eventIndexer.dispatch.${eventType}`, {
    'indexer.event_type': eventType,
    'indexer.ledger': rawEvent.ledger,
    'indexer.tx_hash': rawEvent.txHash ?? '',
  }, async () => {
    try {
      await handler(rawEvent, meta);
    } catch (err) {
      if (err.code === 'P2002') return;
      console.error(`[Indexer] Failed to handle ${eventType}:`, err.message);
      throw err;
    }
  });
};

// ─── Core loop ────────────────────────────────────────────────────────────────

/**
 * Fetches and processes all new events since lastProcessedLedger.
 *
 * @param {number} fromLedger
 * @returns {Promise<number>} the latest ledger sequence processed
 */
const fetchAndProcessEvents = async (fromLedger) => {
  return withSpan('eventIndexer.fetchAndProcessEvents', { 'indexer.from_ledger': fromLedger }, async (span) => {
    if (!CONTRACT_ID) {
      console.warn('[Indexer] ESCROW_CONTRACT_ID not set — skipping fetch');
      return fromLedger;
    }

    const events = await getContractEvents(fromLedger, CONTRACT_ID);
    const latestLedger = await getLatestLedger();

    span.setAttribute('indexer.events_count', events.length);
    span.setAttribute('indexer.latest_ledger', latestLedger);

    for (const event of events) {
      await dispatchEvent(event);
    }

    if (events.length > 0) {
      console.log(`[Indexer] Processed ${events.length} events up to ledger ${latestLedger}`);
    }

    return latestLedger;
  });
};

/**
 * Starts the indexer polling loop.
 * Loads the last processed ledger from DB and polls on POLL_INTERVAL_MS.
 */
const startIndexer = async () => {
  // Load persisted cursor
  const state = await prisma.indexerState.upsert({
    where: { id: 1 },
    create: { id: 1, lastProcessedLedger: BigInt(process.env.INDEXER_START_LEDGER || '0') },
    update: {},
  });

  let lastProcessedLedger = Number(state.lastProcessedLedger);
  console.log(`[Indexer] Starting from ledger ${lastProcessedLedger}`);

  const tick = async () => {
    try {
      const latest = await fetchAndProcessEvents(lastProcessedLedger);
      if (latest > lastProcessedLedger) {
        lastProcessedLedger = latest;
        await prisma.indexerState.update({
          where: { id: 1 },
          data: { lastProcessedLedger: BigInt(lastProcessedLedger) },
        });
      }
    } catch (err) {
      console.error('[Indexer] Polling error:', err.message);
    }
  };

  // Run immediately then on interval
  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a Prisma create operation for the contract_events table.
 * Used inside $transaction arrays to atomically record the raw event.
 */
const buildEventInsert = (event, meta, escrowId) =>
  prisma.contractEvent.create({
    data: {
      ledger: meta.ledger,
      ledgerAt: meta.ledgerAt,
      contractId: meta.contractId ?? CONTRACT_ID,
      eventType: parseEventType(event.topic[0]),
      escrowId: escrowId ?? null,
      topics: toJson(event.topic),
      data: toJson(event.value),
      txHash: meta.txHash,
      eventIndex: meta.eventIndex,
    },
  });

export {
  startIndexer,
  fetchAndProcessEvents,
  dispatchEvent,
  handleEscrowCreated,
  handleMilestoneAdded,
  handleMilestoneSubmitted,
  handleMilestoneApproved,
  handleMilestoneRejected,
  handleMilestoneDisputed,
  handleFundsReleased,
  handleEscrowCancelled,
  handleDisputeRaised,
  handleDisputeResolved,
  handleReputationUpdated,
};
