/**
 * Ledger Balance Worker — Daily Invariant Enforcement
 *
 * Runs `LedgerService.verifyBalance` across every active escrow once per day
 * (or on-demand via the `LEDGER_BALANCE_CHECK` BullMQ queue).
 *
 * Any imbalance triggers a critical alert via `alertService` and is recorded
 * in the admin audit log so it surfaces in the admin panel.
 *
 * Schedule: every day at 02:00 UTC (configurable via
 *   LEDGER_BALANCE_CRON env-var, default "0 2 * * *").
 *
 * @module workers/ledgerBalanceWorker
 */

import { Worker, Queue, QueueScheduler } from 'bullmq';
import prisma from '../lib/prisma.js';
import { verifyBalance } from '../services/ledgerService.js';
import { createModuleLogger } from '../config/logger.js';
import alertService from '../services/alertService.js';

const log = createModuleLogger('worker.ledgerBalance');

const QUEUE_NAME = 'ledger-balance-check';
const CRON_SCHEDULE = process.env.LEDGER_BALANCE_CRON ?? '0 2 * * *';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Active-ish statuses — terminal escrows don't need daily checks.
const ACTIVE_STATUSES = ['Funded', 'InProgress', 'ReleaseRequested', 'Disputed', 'Active'];

// ── Queue + Scheduler setup ───────────────────────────────────────────────────

let _queue = null;
let _scheduler = null;
let _worker = null;

function getConnection() {
  return { url: REDIS_URL };
}

/**
 * Process a single balance-check job.
 * If `data.escrowId` is set, check only that escrow; otherwise sweep all active.
 */
async function processJob(job) {
  const { escrowId: singleId } = job.data ?? {};

  if (singleId) {
    await checkSingleEscrow(BigInt(singleId));
    return;
  }

  // Sweep all active escrows in batches to keep memory bounded.
  const BATCH = 200;
  let cursor = undefined;
  let totalChecked = 0;
  let totalImbalanced = 0;

  do {
    const batch = await prisma.escrow.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      select: { id: true },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });

    for (const { id } of batch) {
      const imbalanced = await checkSingleEscrow(id);
      if (imbalanced) totalImbalanced++;
      totalChecked++;
    }

    cursor = batch.length === BATCH ? batch[batch.length - 1].id : undefined;
  } while (cursor !== undefined);

  log.info({
    message: 'ledger_balance_sweep_complete',
    totalChecked,
    totalImbalanced,
  });

  if (totalImbalanced > 0) {
    await alertService.sendCriticalAlert({
      title: 'Ledger invariant violations detected',
      message: `${totalImbalanced} of ${totalChecked} active escrows have imbalanced ledgers.`,
      severity: 'critical',
      metadata: { totalChecked, totalImbalanced },
    }).catch((err) =>
      log.error({ message: 'alert_send_failed', error: err.message }),
    );
  }
}

/**
 * Verify a single escrow's ledger balance.
 * Returns `true` if an imbalance was detected.
 *
 * @param {bigint} escrowId
 * @returns {Promise<boolean>}
 */
async function checkSingleEscrow(escrowId) {
  try {
    const result = await verifyBalance(escrowId);

    if (!result.balanced) {
      log.error({
        message: 'ledger_invariant_violation',
        escrowId: String(escrowId),
        totalDebits: result.totalDebits,
        totalCredits: result.totalCredits,
        discrepancy: result.discrepancy,
        orphaned: result.orphaned,
      });

      // Record in admin audit log for audit trail
      await prisma.adminAuditLog.create({
        data: {
          tenantId: 'system',
          action: 'LEDGER_INVARIANT_VIOLATION',
          targetAddress: String(escrowId),
          reason: `Ledger imbalance: debits=${result.totalDebits} credits=${result.totalCredits} discrepancy=${result.discrepancy}`,
          performedBy: 'ledger-balance-worker',
          performedAt: new Date(),
        },
      }).catch((err) =>
        log.error({ message: 'audit_log_write_failed', error: err.message }),
      );

      await alertService.sendCriticalAlert({
        title: 'Ledger invariant violation',
        message: `Escrow ${escrowId} has an imbalanced ledger. Discrepancy: ${result.discrepancy}`,
        severity: 'critical',
        metadata: { escrowId: String(escrowId), ...result },
      }).catch((err) =>
        log.error({ message: 'alert_send_failed', error: err.message }),
      );

      return true;
    }

    return false;
  } catch (err) {
    log.error({
      message: 'ledger_balance_check_error',
      escrowId: String(escrowId),
      error: err.message,
    });
    return false; // don't count errors as imbalances
  }
}

// ── Public lifecycle ──────────────────────────────────────────────────────────

/**
 * Start the ledger balance worker and schedule the daily job.
 * Safe to call multiple times — returns early if already running.
 */
export async function startLedgerBalanceWorker() {
  if (_worker) return;

  const connection = getConnection();

  // BullMQ v3+ requires QueueScheduler for repeatable jobs
  try {
    _scheduler = new QueueScheduler(QUEUE_NAME, { connection });
  } catch {
    // BullMQ v4+ removed QueueScheduler — ignore if not available
  }

  _queue = new Queue(QUEUE_NAME, { connection });

  // Upsert the daily repeatable job so it survives restarts without duplicates.
  await _queue.add(
    'daily-sweep',
    {},
    {
      repeat: { cron: CRON_SCHEDULE, tz: 'UTC' },
      jobId: 'ledger-balance-daily',
      removeOnComplete: { count: 7 },
      removeOnFail: { count: 30 },
    },
  );

  _worker = new Worker(QUEUE_NAME, processJob, {
    connection,
    concurrency: 1, // serial — prevents DB connection spikes
  });

  _worker.on('failed', (job, err) => {
    log.error({
      message: 'ledger_balance_job_failed',
      jobId: job?.id,
      error: err.message,
    });
  });

  _worker.on('completed', (job) => {
    log.info({ message: 'ledger_balance_job_completed', jobId: job.id });
  });

  log.info({ message: 'ledger_balance_worker_started', cron: CRON_SCHEDULE });
}

/**
 * Enqueue an immediate on-demand balance check.
 *
 * @param {bigint | string | number | null} escrowId  — null sweeps all active escrows
 */
export async function enqueueBalanceCheck(escrowId = null) {
  if (!_queue) throw new Error('Ledger balance worker not started');
  await _queue.add(
    'on-demand',
    { escrowId: escrowId ? String(escrowId) : null },
    { removeOnComplete: true, removeOnFail: { count: 5 } },
  );
}

/**
 * Graceful shutdown — drain in-flight jobs, close connections.
 */
export async function stopLedgerBalanceWorker() {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_scheduler) {
    await _scheduler.close();
    _scheduler = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
  log.info({ message: 'ledger_balance_worker_stopped' });
}

export default { startLedgerBalanceWorker, stopLedgerBalanceWorker, enqueueBalanceCheck };
