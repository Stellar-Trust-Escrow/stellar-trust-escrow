/**
 * Payment Streaming Indexer
 *
 * Polls the Stellar network for Soroban contract events emitted by the
 * streaming payment contract and writes them to PostgreSQL, keeping the
 * database in sync so the REST API can serve historical data.
 *
 * ## Event → DB Mapping
 *
 * | Contract Event    | event_type   | DB Side-Effect                            |
 * |-------------------|--------------|-------------------------------------------|
 * | StreamCreated     | str_crt      | INSERT PaymentStream + ContractEvent      |
 * | StreamClaimed     | str_clm      | UPDATE claimed_total + last_claimed_at    |
 * | StreamCancelled   | str_can      | UPDATE status + cancelledAt               |
 *
 * @module streamingIndexer
 */

import { createModuleLogger } from '../config/logger.js';
import prisma from '../lib/prisma.js';
import { scValToNative } from '@stellar/stellar-sdk';
import { getContractEvents, getLatestLedger } from './stellarService.js';

const log = createModuleLogger('streamingIndexer');

const STREAMING_CONTRACT_ID = process.env.STREAMING_CONTRACT_ID || '';
const POLL_INTERVAL_MS = parseInt(process.env.STREAMING_INDEXER_POLL_INTERVAL_MS || '5000', 10);

// ─── XDR / value helpers ──────────────────────────────────────────────────────

const _scValToJs = (scVal) => {
  if (scVal == null) return null;
  try {
    return scValToNative(scVal);
  } catch {
    return String(scVal);
  }
};

const toJson = (value) =>
  JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

const parseEventType = (topic0) => {
  if (typeof topic0 === 'string') return topic0;
  if (topic0?.value) return String(topic0.value());
  return String(topic0);
};

const parseAddress = (scVal) => {
  if (typeof scVal === 'string') return scVal;
  try {
    return scVal.address().toString();
  } catch {
    return String(scVal);
  }
};

const parseBigInt = (scVal) => {
  if (typeof scVal === 'bigint') return scVal;
  if (typeof scVal === 'number') return BigInt(scVal);
  try {
    return BigInt(scVal.value().toString());
  } catch {
    return BigInt(String(scVal));
  }
};

const parseOptionU64 = (scVal) => {
  if (scVal == null) return null;
  try {
    const val = scVal.value();
    if (val == null) return null;
    return BigInt(val.toString());
  } catch {
    return null;
  }
};

// ─── Event handlers ───────────────────────────────────────────────────────────

/**
 * Handles str_crt — inserts a new PaymentStream row.
 * topic: (str_crt, stream_id)
 * data:  (sender, recipient, token, total_amount, rate_per_second, start_at)
 */
const handleStreamCreated = async (event, meta) => {
  const streamId = parseBigInt(event.topic[1]);
  const [sender, recipient, token, totalAmount, ratePerSecond, startAt] = event.value;

  await prisma.$transaction([
    prisma.paymentStream.upsert({
      where: { streamId },
      create: {
        streamId,
        senderAddress: parseAddress(sender),
        recipientAddress: parseAddress(recipient),
        tokenAddress: parseAddress(token),
        totalAmount: parseBigInt(totalAmount).toString(),
        ratePerSecond: parseBigInt(ratePerSecond).toString(),
        startAt: new Date(Number(parseBigInt(startAt)) * 1000),
        status: 'Active',
        claimedTotal: '0',
      },
      update: {},
    }),
    buildEventInsert(event, meta, streamId),
  ]);

  log.info({ message: 'stream_created_indexed', streamId: streamId.toString() });
};

/**
 * Handles str_clm — updates claimed_total and last_claimed_at.
 * topic: (str_clm, stream_id)
 * data:  (amount, recipient, remaining)
 */
const handleStreamClaimed = async (event, meta) => {
  const streamId = parseBigInt(event.topic[1]);
  const [amount] = event.value;
  const claimedAmount = parseBigInt(amount);

  await prisma.$transaction([
    prisma.paymentStream.updateMany({
      where: { streamId },
      data: {
        claimedTotal: { increment: claimedAmount.toString() },
        lastClaimedAt: meta.ledgerAt,
        status: 'Active',
      },
    }),
    buildEventInsert(event, meta, streamId),
  ]);

  log.info({ message: 'stream_claimed_indexed', streamId: streamId.toString(), amount: claimedAmount.toString() });
};

/**
 * Handles str_can — marks stream as Cancelled.
 * topic: (str_can, stream_id)
 * data:  (to_recipient, to_sender)
 */
const handleStreamCancelled = async (event, meta) => {
  const streamId = parseBigInt(event.topic[1]);

  await prisma.$transaction([
    prisma.paymentStream.updateMany({
      where: { streamId },
      data: {
        status: 'Cancelled',
        cancelledAt: meta.ledgerAt,
      },
    }),
    buildEventInsert(event, meta, streamId),
  ]);

  log.info({ message: 'stream_cancelled_indexed', streamId: streamId.toString() });
};

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const HANDLERS = {
  str_crt: handleStreamCreated,
  str_clm: handleStreamClaimed,
  str_can: handleStreamCancelled,
};

const dispatchEvent = async (rawEvent) => {
  const eventType = parseEventType(rawEvent.topic[0]);
  const handler = HANDLERS[eventType];

  if (!handler) {
    log.warn({ message: 'streaming_indexer_unknown_event', eventType });
    return;
  }

  const meta = {
    ledger: BigInt(rawEvent.ledger),
    ledgerAt: new Date(rawEvent.ledgerClosedAt),
    txHash: rawEvent.txHash,
    eventIndex: rawEvent.id ? parseInt(rawEvent.id.split('-')[1] ?? '0', 10) : 0,
    contractId: rawEvent.contractId,
  };

  try {
    await handler(rawEvent, meta);
  } catch (err) {
    if (err.code === 'P2002') return;
    log.error({
      message: 'streaming_indexer_handle_failed',
      eventType,
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }
};

// ─── Core loop ────────────────────────────────────────────────────────────────

const fetchAndProcessEvents = async (fromLedger) => {
  if (!STREAMING_CONTRACT_ID) {
    log.warn({ message: 'streaming_indexer_contract_id_unset' });
    return fromLedger;
  }

  const events = await getContractEvents(fromLedger, STREAMING_CONTRACT_ID);
  const latestLedger = await getLatestLedger();

  for (const event of events) {
    await dispatchEvent(event);
  }

  if (events.length > 0) {
    log.info({
      message: 'streaming_indexer_events_processed',
      count: events.length,
      latestLedger: String(latestLedger),
    });
  }

  return latestLedger;
};

const startIndexer = async () => {
  const state = await prisma.indexerState.upsert({
    where: { id: 2 },
    create: { id: 2, lastProcessedLedger: BigInt(process.env.STREAMING_INDEXER_START_LEDGER || '0') },
    update: {},
  });

  let lastProcessedLedger = Number(state.lastProcessedLedger);
  log.info({ message: 'streaming_indexer_started', lastProcessedLedger });

  const tick = async () => {
    try {
      const latest = await fetchAndProcessEvents(lastProcessedLedger);
      if (latest > lastProcessedLedger) {
        lastProcessedLedger = latest;
        await prisma.indexerState.update({
          where: { id: 2 },
          data: { lastProcessedLedger: BigInt(lastProcessedLedger) },
        });
      }
    } catch (err) {
      log.error({
        message: 'streaming_indexer_polling_error',
        error: err.message,
        stack: err.stack,
      });
    }
  };

  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildEventInsert = (event, meta, streamId) =>
  prisma.contractEvent.create({
    data: {
      ledger: meta.ledger,
      ledgerAt: meta.ledgerAt,
      contractId: meta.contractId ?? STREAMING_CONTRACT_ID,
      eventType: parseEventType(event.topic[0]),
      escrowId: null,
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
  handleStreamCreated,
  handleStreamClaimed,
  handleStreamCancelled,
};
