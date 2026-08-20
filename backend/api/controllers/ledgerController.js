/**
 * Ledger Controller
 *
 * Read-only endpoints for the double-entry escrow ledger.
 *
 * Routes wired in ledgerRoutes.js:
 *   GET /api/v1/escrows/:id/ledger          — paginated entries per escrow
 *   GET /api/v1/admin/reconciliation-report  — aggregate report (admin only)
 *
 * @module api/controllers/ledgerController
 */

import { logControllerError } from '../../config/logger.js';
import {
  getEscrowLedger,
  getReconciliationReport,
  verifyBalance,
} from '../../services/ledgerService.js';

// ── GET /api/v1/escrows/:id/ledger ────────────────────────────────────────────

/**
 * Return paginated ledger entries for a single escrow.
 *
 * Query params:
 *   page    — 1-based page number (default 1, ignored when cursor is set)
 *   limit   — entries per page (1–200, default 50)
 *   cursor  — ISO 8601 `created_at` cursor for keyset pagination
 */
export const getEscrowLedgerEntries = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.id);
    const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit ?? '50', 10)));
    const cursor = req.query.cursor ?? undefined;

    const result = await getEscrowLedger({ escrowId, page, limit, cursor });

    res.json(result);
  } catch (err) {
    if (err.message?.includes('Cannot convert') || err.code === 'ERR_INVALID_ARG_VALUE') {
      return res.status(400).json({ error: 'Invalid escrow id', code: 'INVALID_ID' });
    }
    logControllerError('ledger.getEscrowLedgerEntries', err, req);
    res.status(500).json({ error: 'Failed to fetch ledger entries' });
  }
};

// ── GET /api/v1/admin/reconciliation-report ───────────────────────────────────

/**
 * Generate an aggregate reconciliation report.
 *
 * Query params:
 *   from      — ISO 8601 start date (inclusive)
 *   to        — ISO 8601 end date (inclusive, extended to end-of-day)
 *   currency  — filter by currency symbol (e.g. XLM, USDC)
 */
export const getReconciliationReportHandler = async (req, res) => {
  try {
    const { from, to, currency } = req.query;

    // Basic date validation
    if (from && isNaN(Date.parse(from))) {
      return res.status(400).json({ error: '`from` must be a valid ISO 8601 date', code: 'INVALID_DATE' });
    }
    if (to && isNaN(Date.parse(to))) {
      return res.status(400).json({ error: '`to` must be a valid ISO 8601 date', code: 'INVALID_DATE' });
    }
    if (from && to && new Date(from) > new Date(to)) {
      return res.status(400).json({ error: '`from` must be before `to`', code: 'INVALID_DATE_RANGE' });
    }

    const tenantId = req.tenant?.id ?? undefined;

    const report = await getReconciliationReport({ from, to, currency, tenantId });

    res.json({ data: report });
  } catch (err) {
    logControllerError('ledger.getReconciliationReport', err, req);
    res.status(500).json({ error: 'Failed to generate reconciliation report' });
  }
};

// ── GET /api/v1/escrows/:id/ledger/verify ─────────────────────────────────────

/**
 * Ad-hoc invariant check for a single escrow.
 * Returns the balance verification result — useful for health checks.
 */
export const verifyEscrowBalance = async (req, res) => {
  try {
    const escrowId = BigInt(req.params.id);
    const result = await verifyBalance(escrowId);

    const status = result.balanced ? 200 : 409;
    res.status(status).json({
      escrowId: req.params.id,
      ...result,
    });
  } catch (err) {
    if (err.message?.includes('Cannot convert')) {
      return res.status(400).json({ error: 'Invalid escrow id', code: 'INVALID_ID' });
    }
    logControllerError('ledger.verifyEscrowBalance', err, req);
    res.status(500).json({ error: 'Failed to verify balance' });
  }
};

export default {
  getEscrowLedgerEntries,
  getReconciliationReportHandler,
  verifyEscrowBalance,
};
