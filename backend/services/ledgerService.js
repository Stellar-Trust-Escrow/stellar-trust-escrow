/**
 * LedgerService — Double-Entry Escrow Settlement Ledger
 *
 * Every fund movement in the system produces exactly two rows in
 * `ledger_entries`: a Debit on one account and a Credit on another.  Both
 * rows are created inside the caller's Prisma transaction (the `tx` parameter)
 * so that either both rows land or neither does — the debit can never exist
 * without the matching credit.
 *
 * ## Account model
 *
 *   Escrow   — funds held in escrow (the "vault")
 *   Buyer    — the client / buyer party
 *   Seller   — the freelancer / seller party
 *   Platform — the platform fee wallet
 *   Arbiter  — the arbiter fee wallet
 *
 * ## Double-entry flow examples
 *
 *   Fund:            Buyer → Debit,   Escrow → Credit
 *   Release:         Escrow → Debit,  Seller → Credit
 *   Fee:             Escrow → Debit,  Platform → Credit
 *   Refund:          Escrow → Debit,  Buyer → Credit
 *   Dispute resolve: Escrow → Debit,  Seller → Credit  (partial)
 *                    Escrow → Debit,  Buyer → Credit   (partial refund)
 *   Penalty:         Escrow → Debit,  Platform → Credit
 *   Adjustment:      any pair, caller decides
 *
 * ## Immutability
 *
 *   No UPDATE or DELETE is ever issued against `ledger_entries`.
 *   Corrections must be made as a new offsetting Adjustment pair.
 *
 * @module services/ledgerService
 */

import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { createModuleLogger } from '../config/logger.js';
import prisma from '../lib/prisma.js';

const log = createModuleLogger('service.ledgerService');

// ── Re-export enum constants so callers don't need to import @prisma/client ───

export const AccountType = /** @type {const} */ ({
  Escrow: 'Escrow',
  Buyer: 'Buyer',
  Seller: 'Seller',
  Platform: 'Platform',
  Arbiter: 'Arbiter',
});

export const Direction = /** @type {const} */ ({
  Debit: 'Debit',
  Credit: 'Credit',
});

export const EntryType = /** @type {const} */ ({
  Fund: 'Fund',
  Release: 'Release',
  Refund: 'Refund',
  Fee: 'Fee',
  Penalty: 'Penalty',
  Adjustment: 'Adjustment',
});

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Parse an amount string/bigint/Decimal into a `Prisma.Decimal`.
 * Throws `RangeError` for non-positive amounts so callers get a clear signal.
 *
 * @param {string | bigint | Prisma.Decimal} amount
 * @returns {Prisma.Decimal}
 */
function toDecimal(amount) {
  const d = new Prisma.Decimal(String(amount));
  if (d.isNaN() || !d.isFinite()) {
    throw new RangeError(`LedgerService: invalid amount "${amount}"`);
  }
  if (d.lte(0)) {
    throw new RangeError(`LedgerService: amount must be positive, got "${amount}"`);
  }
  return d;
}

// ── Core public API ───────────────────────────────────────────────────────────

/**
 * Record a double-entry fund movement.
 *
 * Creates exactly two rows inside the caller's active Prisma interactive
 * transaction (`tx`):
 *   • Debit  on `fromAccount`
 *   • Credit on `toAccount`
 *
 * Throws if `amount` is non-positive or if either insert fails (Prisma will
 * propagate the error and roll back the caller's transaction automatically).
 *
 * @param {{
 *   tx:          import('@prisma/client').PrismaClient,
 *   tenantId:    string,
 *   escrowId:    bigint | string | number,
 *   fromAccount: keyof typeof AccountType,
 *   toAccount:   keyof typeof AccountType,
 *   amount:      string | bigint | Prisma.Decimal,
 *   currency?:   string,
 *   entryType:   keyof typeof EntryType,
 *   referenceId: string,
 * }} params
 * @returns {Promise<[LedgerEntry, LedgerEntry]>}  [debitRow, creditRow]
 */
export async function recordMovement({
  tx,
  tenantId,
  escrowId,
  fromAccount,
  toAccount,
  amount,
  currency = 'XLM',
  entryType,
  referenceId,
}) {
  const decimal = toDecimal(amount);
  const amountStr = decimal.toFixed(); // e.g. "1000000" — no scientific notation
  const escrowIdBig = BigInt(escrowId);
  const now = new Date();

  // Both rows share the same timestamp so ordering is deterministic.
  const [debit, credit] = await Promise.all([
    tx.ledgerEntry.create({
      data: {
        id: randomUUID(),
        tenantId,
        escrowId: escrowIdBig,
        accountType: fromAccount,
        direction: Direction.Debit,
        amount: amountStr,
        currency,
        entryType,
        referenceId,
        createdAt: now,
      },
    }),
    tx.ledgerEntry.create({
      data: {
        id: randomUUID(),
        tenantId,
        escrowId: escrowIdBig,
        accountType: toAccount,
        direction: Direction.Credit,
        amount: amountStr,
        currency,
        entryType,
        referenceId,
        createdAt: now,
      },
    }),
  ]);

  log.debug({
    message: 'ledger_movement_recorded',
    escrowId: String(escrowIdBig),
    entryType,
    from: fromAccount,
    to: toAccount,
    amount: amountStr,
    currency,
    referenceId,
  });

  return [debit, credit];
}

/**
 * Verify the debit/credit invariant for a single escrow.
 *
 * Sums all Debit rows and all Credit rows for the given `escrowId`.  If they
 * differ, the escrow has an imbalanced ledger and the discrepancy is returned.
 *
 * Also detects orphaned entries: any entry whose `referenceId` appears an odd
 * number of times (i.e. has no matching counterpart).
 *
 * @param {bigint | string | number} escrowId
 * @returns {Promise<{
 *   balanced:      boolean,
 *   totalDebits:   string,
 *   totalCredits:  string,
 *   discrepancy:   string,
 *   entryCount:    number,
 *   orphaned:      string[],
 * }>}
 */
export async function verifyBalance(escrowId) {
  const escrowIdBig = BigInt(escrowId);

  // Aggregate debits and credits in one round-trip
  const [debitAgg, creditAgg, entries] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      where: { escrowId: escrowIdBig, direction: Direction.Debit },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { escrowId: escrowIdBig, direction: Direction.Credit },
      _sum: { amount: true },
      _count: { id: true },
    }),
    // Fetch referenceIds to detect orphans
    prisma.ledgerEntry.findMany({
      where: { escrowId: escrowIdBig },
      select: { referenceId: true, direction: true },
    }),
  ]);

  const totalDebits = new Prisma.Decimal(debitAgg._sum.amount ?? '0');
  const totalCredits = new Prisma.Decimal(creditAgg._sum.amount ?? '0');
  const discrepancy = totalDebits.minus(totalCredits).abs();
  const balanced = discrepancy.eq(0);
  const entryCount = (debitAgg._count.id ?? 0) + (creditAgg._count.id ?? 0);

  // An orphaned referenceId is one that appears only once (no matching pair).
  const refCounts = new Map();
  for (const { referenceId } of entries) {
    refCounts.set(referenceId, (refCounts.get(referenceId) ?? 0) + 1);
  }
  const orphaned = [...refCounts.entries()]
    .filter(([, count]) => count % 2 !== 0)
    .map(([ref]) => ref);

  if (!balanced) {
    log.warn({
      message: 'ledger_invariant_violated',
      escrowId: String(escrowIdBig),
      totalDebits: totalDebits.toFixed(),
      totalCredits: totalCredits.toFixed(),
      discrepancy: discrepancy.toFixed(),
    });
  }

  return {
    balanced,
    totalDebits: totalDebits.toFixed(),
    totalCredits: totalCredits.toFixed(),
    discrepancy: discrepancy.toFixed(),
    entryCount,
    orphaned,
  };
}

/**
 * Paginated ledger entries for a single escrow.
 *
 * @param {{
 *   escrowId:  bigint | string | number,
 *   page?:     number,
 *   limit?:    number,
 *   cursor?:   string,  // created_at ISO cursor for keyset pagination
 * }} params
 * @returns {Promise<{ data: LedgerEntry[], pagination: object }>}
 */
export async function getEscrowLedger({ escrowId, page = 1, limit = 50, cursor }) {
  const escrowIdBig = BigInt(escrowId);
  const take = Math.min(Math.max(1, limit), 200);
  const skip = cursor ? 0 : (Math.max(1, page) - 1) * take;

  const where = { escrowId: escrowIdBig };
  if (cursor) {
    where.createdAt = { lt: new Date(cursor) };
  }

  const [data, total] = await prisma.$transaction([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip: cursor ? 0 : skip,
    }),
    prisma.ledgerEntry.count({ where: { escrowId: escrowIdBig } }),
  ]);

  const nextCursor =
    data.length === take ? data[data.length - 1].createdAt.toISOString() : null;

  return {
    data,
    pagination: {
      total,
      page: cursor ? null : page,
      limit: take,
      nextCursor,
    },
  };
}

/**
 * Generate a reconciliation report for a date range.
 *
 * Aggregates ledger entries into high-level totals suitable for accounting
 * and auditing:
 *   - totalFunded      — sum of Fund Credits on Escrow accounts
 *   - totalReleased    — sum of Release Credits on Seller accounts
 *   - totalFees        — sum of Fee Credits on Platform/Arbiter accounts
 *   - totalRefunded    — sum of Refund Credits on Buyer accounts
 *   - platformRevenue  — subset of totalFees credited to Platform only
 *
 * Optionally filtered by `currency`.
 *
 * @param {{
 *   from?:      Date | string,
 *   to?:        Date | string,
 *   currency?:  string,
 *   tenantId?:  string,
 * }} params
 * @returns {Promise<ReconciliationReport>}
 */
export async function getReconciliationReport({ from, to, currency, tenantId } = {}) {
  const dateFilter = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    dateFilter.lte = end;
  }

  const base = {
    ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
    ...(currency ? { currency } : {}),
    ...(tenantId ? { tenantId } : {}),
    direction: Direction.Credit, // Credits are the "received" side for each account
  };

  const [funded, released, fees, arbiterFees, refunded, entryCount] = await Promise.all([
    // Total funded: Fund Credits into the Escrow vault
    prisma.ledgerEntry.aggregate({
      where: { ...base, entryType: EntryType.Fund, accountType: AccountType.Escrow },
      _sum: { amount: true },
      _count: { id: true },
    }),
    // Total released to sellers
    prisma.ledgerEntry.aggregate({
      where: { ...base, entryType: EntryType.Release, accountType: AccountType.Seller },
      _sum: { amount: true },
      _count: { id: true },
    }),
    // Platform fees
    prisma.ledgerEntry.aggregate({
      where: { ...base, entryType: EntryType.Fee, accountType: AccountType.Platform },
      _sum: { amount: true },
      _count: { id: true },
    }),
    // Arbiter fees
    prisma.ledgerEntry.aggregate({
      where: { ...base, entryType: EntryType.Fee, accountType: AccountType.Arbiter },
      _sum: { amount: true },
      _count: { id: true },
    }),
    // Total refunded to buyers
    prisma.ledgerEntry.aggregate({
      where: { ...base, entryType: EntryType.Refund, accountType: AccountType.Buyer },
      _sum: { amount: true },
      _count: { id: true },
    }),
    // Total entries in range (for pagination/perf info)
    prisma.ledgerEntry.count({
      where: {
        ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
        ...(currency ? { currency } : {}),
        ...(tenantId ? { tenantId } : {}),
      },
    }),
  ]);

  const totalFunded = new Prisma.Decimal(funded._sum.amount ?? '0');
  const totalReleased = new Prisma.Decimal(released._sum.amount ?? '0');
  const platformRevenue = new Prisma.Decimal(fees._sum.amount ?? '0');
  const arbiterRevenue = new Prisma.Decimal(arbiterFees._sum.amount ?? '0');
  const totalFees = platformRevenue.plus(arbiterRevenue);
  const totalRefunded = new Prisma.Decimal(refunded._sum.amount ?? '0');

  return {
    period: { from: from ? new Date(from).toISOString() : null, to: to ? new Date(to).toISOString() : null },
    currency: currency ?? 'ALL',
    totalFunded: totalFunded.toFixed(),
    totalReleased: totalReleased.toFixed(),
    totalFees: totalFees.toFixed(),
    totalRefunded: totalRefunded.toFixed(),
    platformRevenue: platformRevenue.toFixed(),
    arbiterRevenue: arbiterRevenue.toFixed(),
    entryCount,
  };
}

export default {
  recordMovement,
  verifyBalance,
  getEscrowLedger,
  getReconciliationReport,
  AccountType,
  Direction,
  EntryType,
};
