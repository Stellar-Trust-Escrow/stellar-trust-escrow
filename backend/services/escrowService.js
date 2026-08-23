/**
 * Escrow CQRS Write Model
 *
 * Command handlers that mutate escrow state. Every handler follows the same
 * shape:
 *
 *   1. Validate preconditions (status, amounts) — fail fast with a domain
 *      error carrying `code` + HTTP `status` (409 conflict, 422 unprocessable).
 *   2. Advance the escrow through the pure state machine
 *      (`lib/escrowStateMachine`). Illegal moves throw — we never fork the
 *      state graph here.
 *   3. Perform *all* DB writes inside a single `withTransaction` call pinned to
 *      `Serializable` isolation, including the immutable `AdminAuditLog` row.
 *   4. After the transaction commits, emit a domain event (fire-and-forget).
 *      If emission fails we record a `failed_events` row — the DB write is
 *      already durable and is deliberately NOT rolled back.
 *
 * Concurrency: a per-escrow in-process mutex serialises commands that touch the
 * same escrow. This is defence-in-depth on top of the Serializable transaction
 * — it guarantees the read-modify-write is atomic even when the underlying
 * store's isolation is weaker (e.g. the in-memory test client), which is exactly
 * what prevents double-spend under overlapping releases.
 *
 * @module services/escrowService
 */

import prisma from '../lib/prisma.js';
import { withTransaction } from '../lib/transaction.js';
import {
  TRANSITIONS,
  allowedTransitions,
  transition,
} from '../lib/escrowStateMachine.js';
import { emitEscrowEvent } from './escrowRealtime.js';
import { calculateEarning } from './referralService.js';
import { createModuleLogger } from '../config/logger.js';
import { recordMovement, AccountType, EntryType } from './ledgerService.js';

const log = createModuleLogger('service.escrowService');

const DEFAULT_TENANT = 'default';

// ─── Status mapping: state-machine ↔ DB enum ─────────────────────────────────
// The DB `EscrowStatus` enum stores the canonical lifecycle vocabulary. A few
// legacy values (Active / Completed) are aliased so older rows still resolve.
export const SM_TO_DB = {
  draft: 'Draft',
  funded: 'Funded',
  in_progress: 'InProgress',
  release_requested: 'ReleaseRequested',
  disputed: 'Disputed',
  resolved: 'Resolved',
  released: 'Released',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export const DB_TO_SM = {
  Draft: 'draft',
  Funded: 'funded',
  InProgress: 'in_progress',
  ReleaseRequested: 'release_requested',
  Disputed: 'disputed',
  Resolved: 'resolved',
  Released: 'released',
  Cancelled: 'cancelled',
  Expired: 'expired',
  // legacy aliases
  Active: 'funded',
  Completed: 'released',
};

const RELEASABLE = new Set(['funded', 'in_progress', 'release_requested']);
const EXPIRABLE = new Set(['funded', 'in_progress']);
const CANCELABLE = new Set(['funded', 'in_progress', 'disputed']);

// ─── Domain error helper ─────────────────────────────────────────────────────
function domainError(message, code, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

// ─── Per-escrow mutex ────────────────────────────────────────────────────────
const _locks = new Map();

function acquire(key) {
  const prev = _locks.get(key) || Promise.resolve();
  let release;
  const done = new Promise((resolve) => {
    release = resolve;
  });
  _locks.set(key, done);
  return { prev, release };
}

async function withEscrowLock(key, fn) {
  const { prev, release } = acquire(String(key));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

/** Test helper — clear outstanding locks between tests. */
export function __clearLocks() {
  _locks.clear();
}

// ─── State-machine stepping ──────────────────────────────────────────────────
/**
 * Mutate a `{ status }` proxy through the shortest legal path to `target`.
 * Throws (409) if no legal path exists. We reuse the pure `transition` so every
 * step is validated against the canonical table.
 */
function stepTo(proxy, target) {
  if (proxy.status === target) return;

  const queue = [[proxy.status, []]];
  const seen = new Set([proxy.status]);

  while (queue.length) {
    const [state, path] = queue.shift();
    for (const next of allowedTransitions(state)) {
      if (next === target) {
        for (const step of [...path, next]) transition(proxy, step);
        return;
      }
      if (!seen.has(next)) {
        seen.add(next);
        queue.push([next, [...path, next]]);
      }
    }
  }

  throw domainError(`No legal transition ${proxy.status} → ${target}`, 'ILLEGAL_TRANSITION', 409);
}

// ─── Domain-event emission (post-commit, fire-and-forget) ────────────────────
/**
 * Emit a domain event. On failure, persist a `failed_events` row so the event
 * is not silently lost. The originating DB transaction has already committed
 * and is intentionally not rolled back.
 */
async function emitDomainEvent(type, payload) {
  try {
    await emitEscrowEvent({ type, ...payload, at: new Date().toISOString() });
  } catch (err) {
    log.error({ message: 'domain_event_emit_failed', type, error: err.message });
    try {
      await prisma.failedEvent.create({
        data: {
          tenantId: payload.tenantId || DEFAULT_TENANT,
          eventType: type,
          payload: JSON.parse(JSON.stringify(payload)),
          error: err.message,
          createdAt: new Date(),
        },
      });
    } catch (writeErr) {
      log.error({ message: 'failed_event_write_error', error: writeErr.message });
    }
  }
}

// ─── Command handlers ─────────────────────────────────────────────────────────

/**
 * Create (fund) a new escrow from on-chain creation data.
 * Idempotent on `id`: re-submitting an existing escrow is a 409 conflict.
 */
export async function fundEscrow(data) {
  const {
    id,
    clientAddress,
    freelancerAddress,
    arbiterAddress,
    tokenAddress,
    totalAmount,
    briefHash,
    deadline,
    createdLedger,
    tenantId,
  } = data;

  const escrow = await withEscrowLock(id, () =>
    withTransaction(
      async (tx) => {
        const existing = await tx.escrow.findUnique({ where: { id } });
        if (existing) {
          throw domainError('Escrow already exists', 'ESCROW_CONFLICT', 409);
        }

        const proxy = { status: 'draft' };
        stepTo(proxy, 'funded');

        const now = new Date();
        const created = await tx.escrow.create({
          data: {
            id,
            tenantId: tenantId || DEFAULT_TENANT,
            clientAddress,
            freelancerAddress,
            arbiterAddress: arbiterAddress ?? null,
            tokenAddress,
            totalAmount: String(totalAmount),
            remainingBalance: String(totalAmount),
            status: SM_TO_DB[proxy.status],
            briefHash,
            deadline: deadline ? new Date(deadline) : null,
            createdLedger: BigInt(createdLedger ?? 0),
            createdAt: now,
            updatedAt: now,
          },
        });

        await tx.adminAuditLog.create({
          data: {
            tenantId: created.tenantId,
            action: 'FUND_ESCROW',
            targetAddress: clientAddress,
            reason: `Escrow ${id} funded`,
            performedBy: clientAddress,
            performedAt: now,
          },
        });

        // ── Double-entry ledger: Buyer → Escrow (Fund) ────────────────────
        await recordMovement({
          tx,
          tenantId: created.tenantId,
          escrowId: id,
          fromAccount: AccountType.Buyer,
          toAccount: AccountType.Escrow,
          amount: String(totalAmount),
          entryType: EntryType.Fund,
          referenceId: String(id),
        });

        return created;
      },
      { isolationLevel: 'Serializable' },
    ),
  );

  await emitDomainEvent('escrow.funded', {
    tenantId: escrow.tenantId,
    escrowId: id,
    clientAddress,
    freelancerAddress,
  });

  return escrow;
}

/**
 * Release milestone funds. Throws 422 if `amount` exceeds the remaining balance
 * (this is what guards against double-spend), and 409 if the escrow is not in a
 * releasable state. Transitions to `Released` once the balance hits zero.
 */
export async function releaseMilestone({ escrowId, milestoneIndex, amount, callerAddress, referenceId }) {
  const result = await withEscrowLock(escrowId, () =>
    withTransaction(
      async (tx) => {
        const escrow = await tx.escrow.findUnique({ where: { id: escrowId } });
        if (!escrow) throw domainError('Escrow not found', 'ESCROW_NOT_FOUND', 404);

        const remaining = BigInt(escrow.remainingBalance);
        const amt = BigInt(amount);

        // Order matters: check funds before state so a double-spend surfaces as
        // 422 (insufficient balance) rather than 409.
        if (amt > remaining) {
          throw domainError('Amount exceeds remaining balance', 'INSUFFICIENT_BALANCE', 422);
        }

        const smStatus = DB_TO_SM[escrow.status];
        if (!RELEASABLE.has(smStatus)) {
          throw domainError('Escrow is not in an active state', 'ESCROW_NOT_ACTIVE', 409);
        }

        const newBalance = remaining - amt;
        const target = newBalance === 0n ? 'released' : 'release_requested';

        const proxy = { status: smStatus };
        stepTo(proxy, target);

        const now = new Date();
        if (milestoneIndex != null) {
          await tx.milestone.updateMany({
            where: { escrowId, milestoneIndex },
            data: { status: 'Approved', resolvedAt: now },
          });
        }

        const updated = await tx.escrow.update({
          where: { id: escrowId },
          data: {
            remainingBalance: newBalance.toString(),
            status: SM_TO_DB[proxy.status],
            updatedAt: now,
          },
        });

        await tx.adminAuditLog.create({
          data: {
            tenantId: escrow.tenantId,
            action: 'RELEASE_MILESTONE',
            targetAddress: callerAddress || '',
            reason: `Milestone ${milestoneIndex} released`,
            performedBy: callerAddress || 'system',
            performedAt: now,
          },
        });

        // ── Double-entry ledger: Escrow → Seller (Release) ────────────────
        const ledgerRef = referenceId ?? `${escrowId}:milestone:${milestoneIndex ?? 'unknown'}`;
        await recordMovement({
          tx,
          tenantId: escrow.tenantId,
          escrowId,
          fromAccount: AccountType.Escrow,
          toAccount: AccountType.Seller,
          amount: String(amt),
          entryType: EntryType.Release,
          referenceId: ledgerRef,
        });

        return { escrow: updated, newBalance: newBalance.toString(), status: updated.status };
      },
      { isolationLevel: 'Serializable' },
    ),
  );

  await emitDomainEvent('escrow.milestone_released', {
    tenantId: result.escrow.tenantId,
    escrowId,
    milestoneIndex,
    amount,
    callerAddress,
  });

  // Referral fee-split accounting. Fire-and-forget: a referral lookup/write
  // failure must never block or fail the release itself (calculateEarning
  // already catches its own errors internally and returns null on failure).
  const referralTrigger = result.status === 'Released' ? 'completion' : 'release';
  calculateEarning(escrowId, referralTrigger).catch(() => {});

  return result;
}

/**
 * Raise a dispute. Transitions an active / release-requested escrow to
 * `Disputed` and optionally rejects a specific milestone.
 */
export async function raiseDispute({ escrowId, raisedByAddress, milestoneIndex }) {
  const result = await withEscrowLock(escrowId, () =>
    withTransaction(
      async (tx) => {
        const escrow = await tx.escrow.findUnique({ where: { id: escrowId } });
        if (!escrow) throw domainError('Escrow not found', 'ESCROW_NOT_FOUND', 404);

        const smStatus = DB_TO_SM[escrow.status];
        if (!RELEASABLE.has(smStatus)) {
          throw domainError('Escrow is not in a disputable state', 'ESCROW_NOT_ACTIVE', 409);
        }

        const proxy = { status: smStatus };
        stepTo(proxy, 'disputed');

        const now = new Date();
        if (milestoneIndex != null) {
          await tx.milestone.updateMany({
            where: { escrowId, milestoneIndex },
            data: { status: 'Rejected' },
          });
        }

        const updated = await tx.escrow.update({
          where: { id: escrowId },
          data: { status: SM_TO_DB.disputed, updatedAt: now },
        });

        const dispute = await tx.dispute.create({
          data: {
            tenantId: escrow.tenantId,
            escrowId,
            raisedByAddress,
            raisedAt: now,
          },
        });

        await tx.adminAuditLog.create({
          data: {
            tenantId: escrow.tenantId,
            action: 'RAISE_DISPUTE',
            targetAddress: raisedByAddress,
            reason: `Dispute raised on escrow ${escrowId}`,
            performedBy: raisedByAddress,
            performedAt: now,
          },
        });

        return { escrow: updated, dispute };
      },
      { isolationLevel: 'Serializable' },
    ),
  );

  await emitDomainEvent('escrow.dispute_raised', {
    tenantId: result.escrow.tenantId,
    escrowId,
    raisedByAddress,
    milestoneIndex,
  });

  return result;
}

/**
 * Resolve a dispute. `clientAmount + freelancerAmount` must equal the remaining
 * balance exactly (422 otherwise). Transitions `Disputed → Resolved`.
 */
export async function resolveDispute({ escrowId, clientAmount, freelancerAmount, resolvedBy, resolution, arbiterFee, referenceId }) {
  const result = await withEscrowLock(escrowId, () =>
    withTransaction(
      async (tx) => {
        const escrow = await tx.escrow.findUnique({ where: { id: escrowId } });
        if (!escrow) throw domainError('Escrow not found', 'ESCROW_NOT_FOUND', 404);

        const smStatus = DB_TO_SM[escrow.status];
        if (smStatus !== 'disputed') {
          throw domainError('Escrow is not under dispute', 'ESCROW_NOT_DISPUTED', 409);
        }

        const remaining = BigInt(escrow.remainingBalance);
        const client = BigInt(clientAmount);
        const freelancer = BigInt(freelancerAmount);
        if (client + freelancer !== remaining) {
          throw domainError(
            'clientAmount + freelancerAmount must equal remaining balance',
            'AMOUNT_MISMATCH',
            422,
          );
        }
        const proxy = { status: 'disputed' };
        stepTo(proxy, 'resolved');

        const now = new Date();
        const updated = await tx.escrow.update({
          where: { id: escrowId },
          data: { status: SM_TO_DB.resolved, remainingBalance: '0', updatedAt: now },
        });

        const dispute = await tx.dispute.update({
          where: { escrowId },
          data: {
            resolvedAt: now,
            clientAmount: String(client),
            freelancerAmount: String(freelancer),
            resolvedBy,
            resolution,
            resolutionType: 'MANUAL',
          },
        });

        await tx.adminAuditLog.create({
          data: {
            tenantId: escrow.tenantId,
            action: 'RESOLVE_DISPUTE',
            targetAddress: resolvedBy,
            reason: resolution || 'Dispute resolved',
            performedBy: resolvedBy,
            performedAt: now,
          },
        });

        // ── Double-entry ledger ────────────────────────────────────────────
        // Freelancer share: Escrow → Seller (Release)
        const ledgerRef = referenceId ?? `dispute:${dispute.id}`;
        if (freelancer > 0n) {
          await recordMovement({
            tx,
            tenantId: escrow.tenantId,
            escrowId,
            fromAccount: AccountType.Escrow,
            toAccount: AccountType.Seller,
            amount: String(freelancer),
            entryType: EntryType.Release,
            referenceId: `${ledgerRef}:seller`,
          });
        }
        // Client refund share: Escrow → Buyer (Refund)
        if (client > 0n) {
          await recordMovement({
            tx,
            tenantId: escrow.tenantId,
            escrowId,
            fromAccount: AccountType.Escrow,
            toAccount: AccountType.Buyer,
            amount: String(client),
            entryType: EntryType.Refund,
            referenceId: `${ledgerRef}:buyer`,
          });
        }
        // Optional arbiter fee: Escrow → Arbiter (Fee)
        if (arbiterFee && BigInt(arbiterFee) > 0n) {
          await recordMovement({
            tx,
            tenantId: escrow.tenantId,
            escrowId,
            fromAccount: AccountType.Escrow,
            toAccount: AccountType.Arbiter,
            amount: String(BigInt(arbiterFee)),
            entryType: EntryType.Fee,
            referenceId: `${ledgerRef}:arbiter_fee`,
          });
        }

        return { escrow: updated, dispute };
      },
      { isolationLevel: 'Serializable' },
    ),
  );

  await emitDomainEvent('escrow.dispute_resolved', {
    tenantId: result.escrow.tenantId,
    escrowId,
    clientAmount,
    freelancerAmount,
    resolvedBy,
  });

  return result;
}

/**
 * Expire an escrow. Only valid from `Funded` or `InProgress`.
 */
export async function expireEscrow({ escrowId, expiredLedger, referenceId }) {
  const result = await withEscrowLock(escrowId, () =>
    withTransaction(
      async (tx) => {
        const escrow = await tx.escrow.findUnique({ where: { id: escrowId } });
        if (!escrow) throw domainError('Escrow not found', 'ESCROW_NOT_FOUND', 404);

        const smStatus = DB_TO_SM[escrow.status];
        if (!EXPIRABLE.has(smStatus)) {
          throw domainError('Escrow cannot be expired from this state', 'ESCROW_NOT_EXPIRABLE', 409);
        }

        const proxy = { status: smStatus };
        stepTo(proxy, 'expired');

        const now = new Date();
        const updated = await tx.escrow.update({
          where: { id: escrowId },
          data: {
            status: SM_TO_DB.expired,
            deadline: new Date(Number(expiredLedger) * 1000),
            updatedAt: now,
          },
        });

        await tx.adminAuditLog.create({
          data: {
            tenantId: escrow.tenantId,
            action: 'EXPIRE_ESCROW',
            targetAddress: escrow.clientAddress,
            reason: `Escrow expired at ledger ${expiredLedger}`,
            performedBy: 'system',
            performedAt: now,
          },
        });

        // ── Double-entry ledger: Escrow → Buyer (Refund) ──────────────────
        const expireBalance = BigInt(escrow.remainingBalance);
        if (expireBalance > 0n) {
          await recordMovement({
            tx,
            tenantId: escrow.tenantId,
            escrowId,
            fromAccount: AccountType.Escrow,
            toAccount: AccountType.Buyer,
            amount: String(expireBalance),
            entryType: EntryType.Refund,
            referenceId: referenceId ?? `expire:${escrowId}:ledger:${expiredLedger}`,
          });
        }

        return { escrow: updated };
      },
      { isolationLevel: 'Serializable' },
    ),
  );

  await emitDomainEvent('escrow.expired', {
    tenantId: result.escrow.tenantId,
    escrowId,
    expiredLedger,
  });

  return result;
}

/**
 * Cancel an escrow. Valid from `Funded`, `InProgress`, or `Disputed`.
 */
export async function cancelEscrow({ escrowId, cancelledBy, reason, referenceId }) {
  const result = await withEscrowLock(escrowId, () =>
    withTransaction(
      async (tx) => {
        const escrow = await tx.escrow.findUnique({ where: { id: escrowId } });
        if (!escrow) throw domainError('Escrow not found', 'ESCROW_NOT_FOUND', 404);

        const smStatus = DB_TO_SM[escrow.status];
        if (!CANCELABLE.has(smStatus)) {
          throw domainError('Escrow cannot be cancelled from this state', 'ESCROW_NOT_CANCELABLE', 409);
        }

        const proxy = { status: smStatus };
        stepTo(proxy, 'cancelled');

        const now = new Date();
        const updated = await tx.escrow.update({
          where: { id: escrowId },
          data: { status: SM_TO_DB.cancelled, updatedAt: now },
        });

        await tx.adminAuditLog.create({
          data: {
            tenantId: escrow.tenantId,
            action: 'CANCEL_ESCROW',
            targetAddress: cancelledBy || '',
            reason: reason || 'Escrow cancelled',
            performedBy: cancelledBy || 'system',
            performedAt: now,
          },
        });

        // ── Double-entry ledger: Escrow → Buyer (Refund) ──────────────────
        // Only record if there is a non-zero balance to refund.
        const cancelBalance = BigInt(escrow.remainingBalance);
        if (cancelBalance > 0n) {
          await recordMovement({
            tx,
            tenantId: escrow.tenantId,
            escrowId,
            fromAccount: AccountType.Escrow,
            toAccount: AccountType.Buyer,
            amount: String(cancelBalance),
            entryType: EntryType.Refund,
            referenceId: referenceId ?? `cancel:${escrowId}`,
          });
        }

        return { escrow: updated };
      },
      { isolationLevel: 'Serializable' },
    ),
  );

  await emitDomainEvent('escrow.cancelled', {
    tenantId: result.escrow.tenantId,
    escrowId,
    cancelledBy,
    reason,
  });

  return result;
}

export default {
  fundEscrow,
  releaseMilestone,
  raiseDispute,
  resolveDispute,
  expireEscrow,
  cancelEscrow,
  __clearLocks,
  SM_TO_DB,
  DB_TO_SM,
};
