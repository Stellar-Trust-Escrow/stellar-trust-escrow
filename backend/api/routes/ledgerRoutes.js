/**
 * Ledger Routes
 *
 * Escrow-scoped ledger entries are mounted under /api/v1/escrows/:id/ledger
 * and injected directly into escrowRoutes.js.
 *
 * The reconciliation-report endpoint is admin-only and registered in
 * adminRoutes.js.
 *
 * @module api/routes/ledgerRoutes
 */

import express from 'express';
import {
  getEscrowLedgerEntries,
  verifyEscrowBalance,
} from '../controllers/ledgerController.js';

const router = express.Router({ mergeParams: true });

/**
 * @route  GET /api/v1/escrows/:id/ledger
 * @desc   Paginated double-entry ledger for an escrow
 * @query  page, limit, cursor
 * @access Authenticated user (auth handled by parent escrowRoutes)
 */
router.get('/', getEscrowLedgerEntries);

/**
 * @route  GET /api/v1/escrows/:id/ledger/verify
 * @desc   Verify debit/credit invariant for an escrow (ad-hoc health check)
 * @access Authenticated user (auth handled by parent escrowRoutes)
 */
router.get('/verify', verifyEscrowBalance);

export default router;
