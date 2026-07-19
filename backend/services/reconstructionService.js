import Redis from 'ioredis';
import { SorobanRpc, scValToNative } from '@stellar/stellar-sdk';
import { createModuleLogger } from '../config/logger.js';
import prisma from '../lib/prisma.js';

const logger = createModuleLogger('reconstructionService');

function native(value) {
  try {
    return scValToNative(value);
  } catch {
    return value;
  }
}

function eventParts(event) {
  return {
    type: String(native(event.topic?.[0])),
    escrowId: String(native(event.topic?.[1])),
    values: Array.isArray(event.value) ? event.value.map(native) : native(event.value),
  };
}

function getUnknownEventQueue() {
  if (!process.env.REDIS_HOST && !process.env.REDIS_URL) return null;
  return new Redis(process.env.REDIS_URL || { host: process.env.REDIS_HOST });
}

async function quarantineUnknownEvent(event) {
  const redis = getUnknownEventQueue();
  if (!redis) return;

  try {
    await redis.rpush('reconstruction:unknown-events', JSON.stringify(event));
  } catch (error) {
    logger.warn('Failed to quarantine unknown reconstruction event', {
      error: error.message,
    });
  }
}

function applyEvent(state, event) {
  const { type, escrowId, values } = eventParts(event);

  switch (type) {
    case 'esc_crt': {
      const [clientAddress, freelancerAddress, totalAmount] = values;
      state.escrows.set(escrowId, {
        id: escrowId,
        clientAddress: String(clientAddress),
        freelancerAddress: String(freelancerAddress),
        totalAmount: String(totalAmount),
        remainingBalance: String(totalAmount),
        status: 'Active',
      });
      return true;
    }
    case 'mil_add': {
      const [milestoneIndex, amount] = values;
      state.milestones.set(`${escrowId}:${milestoneIndex}`, {
        escrowId,
        milestoneIndex: Number(milestoneIndex),
        amount: String(amount),
        status: 'Pending',
      });
      return true;
    }
    case 'mil_apr': {
      const [milestoneIndex, amount] = values;
      const key = `${escrowId}:${milestoneIndex}`;
      const milestone = state.milestones.get(key) ?? {
        escrowId,
        milestoneIndex: Number(milestoneIndex),
        amount: String(amount),
      };
      state.milestones.set(key, { ...milestone, status: 'Approved' });

      const escrow = state.escrows.get(escrowId);
      if (escrow) {
        const remaining = BigInt(escrow.remainingBalance) - BigInt(String(amount));
        escrow.remainingBalance = String(remaining < 0n ? 0n : remaining);
      }
      return true;
    }
    case 'dis_rai': {
      const [raisedBy, reason] = values;
      const escrow = state.escrows.get(escrowId);
      if (escrow) escrow.status = 'Disputed';
      state.disputes.set(escrowId, {
        escrowId,
        raisedBy: String(raisedBy),
        reason: String(reason),
      });
      return true;
    }
    default:
      return false;
  }
}

export async function replayEvents(contractId, startLedger, endLedger) {
  const server = new SorobanRpc.Server(process.env.STELLAR_RPC_URL);
  const state = {
    escrows: new Map(),
    milestones: new Map(),
    disputes: new Map(),
  };
  let cursor;
  let eventCount = 0;
  let reachedEnd = false;

  do {
    const response = await server.getEvents({
      startLedger,
      filters: [{ type: 'contract', contractIds: [contractId] }],
      pagination: { limit: 200, ...(cursor ? { cursor } : {}) },
    });

    for (const event of response.events ?? []) {
      if (event.ledger < startLedger) continue;
      if (event.ledger > endLedger) {
        reachedEnd = true;
        continue;
      }

      eventCount += 1;
      if (!applyEvent(state, event)) await quarantineUnknownEvent(event);
    }

    cursor = reachedEnd ? undefined : response.cursor;
  } while (cursor);

  return {
    state,
    eventCount,
    ledgerRange: { from: startLedger, to: endLedger },
  };
}

export async function compareToDb({ state, ledgerRange }) {
  const escrowIds = [...state.escrows.keys()];
  const rows =
    escrowIds.length > 0
      ? await prisma.escrow.findMany({
          where: { id: { in: escrowIds.map(BigInt) } },
        })
      : [];
  const rowsById = new Map(rows.map((row) => [String(row.id), row]));
  const matchedIds = new Set();
  const diverged = [];
  const missingInDb = [];

  for (const [escrowId, chainEscrow] of state.escrows) {
    const row = rowsById.get(escrowId);
    if (!row) {
      missingInDb.push({ escrow_id: escrowId, on_chain: chainEscrow });
      continue;
    }

    matchedIds.add(escrowId);
    for (const field of ['status', 'remainingBalance']) {
      if (String(row[field]) !== String(chainEscrow[field])) {
        diverged.push({
          escrow_id: escrowId,
          field,
          on_chain: chainEscrow[field],
          in_db: row[field],
        });
      }
    }
  }

  const rowsInRange = await prisma.escrow.findMany({
    where: {
      createdLedger: {
        gte: BigInt(ledgerRange.from),
        lte: BigInt(ledgerRange.to),
      },
    },
  });
  const extraInDb = rowsInRange
    .filter((row) => !state.escrows.has(String(row.id)))
    .map((row) => ({ escrow_id: String(row.id), reason: 'no on-chain record' }));
  const matched = [...matchedIds].filter(
    (id) => !diverged.some((entry) => entry.escrow_id === id),
  ).length;

  return {
    diverged,
    missing_in_db: missingInDb,
    extra_in_db: extraInDb,
    summary: {
      matched,
      diverged: new Set(diverged.map((entry) => entry.escrow_id)).size,
      missing_in_db: missingInDb.length,
      extra_in_db: extraInDb.length,
    },
  };
}

function plannedChanges(report) {
  return [
    ...report.diverged.map((entry) => ({
      action: 'updated',
      escrow_id: entry.escrow_id,
      field: entry.field,
      value: entry.on_chain,
    })),
    ...report.extra_in_db.map((entry) => ({
      action: 'orphaned',
      escrow_id: entry.escrow_id,
    })),
    ...report.missing_in_db.map((entry) => ({
      action: 'missing_in_db',
      escrow_id: entry.escrow_id,
    })),
  ];
}

export async function healDb(report, { dryRun = true, triggeredBy = 'system' } = {}) {
  const changes = plannedChanges(report);
  if (dryRun) return { dryRun: true, healed: changes.length, changes };

  for (const change of changes) {
    if (change.action === 'updated') {
      await prisma.escrow.update({
        where: { id: BigInt(change.escrow_id) },
        data: { [change.field]: change.value },
      });
    } else if (change.action === 'orphaned') {
      await prisma.escrow.update({
        where: { id: BigInt(change.escrow_id) },
        data: { status: 'Orphaned' },
      });
    }

    await prisma.reconHealingLog.create({
      data: {
        escrowId: BigInt(change.escrow_id),
        action: change.action,
        details: change,
        triggeredBy,
      },
    });
  }

  return { dryRun: false, healed: changes.length, changes };
}
