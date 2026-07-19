/**
 * Ownership Indexer
 *
 * Polls for TransferAccepted (own_acc) events from the EscrowOwnership
 * contract and keeps EscrowOwnership + OwnershipTransferLog in sync.
 */

import { SorobanRpc, scValToNative } from '@stellar/stellar-sdk';
import prisma from '../lib/prisma.js';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('ownershipIndexer');

const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const TRANSFER_ACCEPTED = 'own_acc';

function safeNative(scVal) {
  if (scVal == null) return null;
  try {
    const v = scValToNative(scVal);
    return typeof v === 'bigint' ? v.toString() : v;
  } catch {
    return String(scVal);
  }
}

/**
 * Process a single TransferAccepted event and upsert DB records.
 *
 * @param {{ escrowId: string, from: string, to: string, txHash: string, ledger: number }} ev
 */
export async function applyTransferAccepted({ escrowId, from, to, txHash, ledger }) {
  await prisma.$transaction([
    prisma.escrowOwnership.upsert({
      where: { escrowId },
      create: {
        escrowId,
        currentOwner: to,
        previousOwner: from,
        transferredAt: new Date(),
        txHash,
      },
      update: {
        previousOwner: from,
        currentOwner: to,
        transferredAt: new Date(),
        txHash,
      },
    }),
    prisma.ownershipTransferLog.create({
      data: { escrowId, fromOwner: from, toOwner: to, txHash, ledger },
    }),
  ]);
  log.info({ type: 'ownership_transfer_indexed', escrowId, from, to });
}

/**
 * Poll ownership events from startLedger.
 * Designed to be called from the main indexer loop or a scheduled job.
 */
export async function pollOwnershipEvents(startLedger) {
  const contractId = process.env.OWNERSHIP_CONTRACT_ID || '';
  if (!contractId) {
    log.debug({ type: 'ownership_indexer_skip', reason: 'OWNERSHIP_CONTRACT_ID not set' });
    return;
  }

  const server = new SorobanRpc.Server(RPC_URL);
  let cursor;

  while (true) {
    const resp = await server.getEvents({
      startLedger,
      filters: [{ type: 'contract', contractIds: [contractId] }],
      cursor,
      limit: 200,
    });

    for (const ev of resp.events ?? []) {
      const topics = (ev.topic ?? []).map(safeNative);
      if (topics[0] !== TRANSFER_ACCEPTED) continue;

      const escrowId = String(topics[1] ?? '');
      const values = Array.isArray(ev.value) ? ev.value.map(safeNative) : [safeNative(ev.value)];
      const from = String(values[0] ?? '');
      const to = String(values[1] ?? '');

      await applyTransferAccepted({
        escrowId,
        from,
        to,
        txHash: ev.txHash ?? '',
        ledger: Number(ev.ledger ?? 0),
      }).catch((err) => log.error({ type: 'ownership_apply_error', escrowId, err: err.message }));
    }

    if (!resp.cursor || (resp.events ?? []).length < 200) break;
    cursor = resp.cursor;
  }
}
