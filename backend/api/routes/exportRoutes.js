/**
 * Escrow Export Routes
 *
 * Async, background-job based export of escrow histories.
 *
 *   POST /api/v1/escrows/export              → queue a job (auth required)
 *   GET  /api/v1/escrows/export/:jobId/status → poll job status (auth required)
 *   GET  /api/v1/escrows/export/:jobId/download → signed, short-lived download
 *
 * The download route is intentionally public: access is granted by the HMAC
 * signature + expiry embedded in the URL, so it can be opened directly in a new
 * browser tab without an Authorization header.
 */

import express from 'express';
import { body } from 'express-validator';

import exportController, {
  VALID_EXPORT_FORMATS,
  VALID_ESCROW_STATUSES,
} from '../controllers/exportController.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

const validateExportRequest = [
  body('format').isIn(VALID_EXPORT_FORMATS).withMessage('format must be one of csv, xlsx'),
  body('dateFrom').isISO8601().withMessage('dateFrom must be an ISO-8601 date'),
  body('dateTo')
    .isISO8601()
    .withMessage('dateTo must be an ISO-8601 date')
    .custom((value, { req }) => {
      if (req.body.dateFrom && new Date(value) < new Date(req.body.dateFrom)) {
        throw new Error('dateTo must be on or after dateFrom');
      }
      return true;
    }),
  body('status').optional().isArray().withMessage('status must be an array'),
  body('status.*')
    .optional()
    .isIn(VALID_ESCROW_STATUSES)
    .withMessage(`status entries must be one of ${VALID_ESCROW_STATUSES.join(', ')}`),
];

/**
 * @route POST /api/v1/escrows/export
 */
router.post('/', authMiddleware, validateExportRequest, exportController.createEscrowExport);

/**
 * @route GET /api/v1/escrows/export/:jobId/status
 */
router.get('/:jobId/status', authMiddleware, exportController.getEscrowExportStatus);

/**
 * @route GET /api/v1/escrows/export/:jobId/download
 */
router.get('/:jobId/download', exportController.downloadEscrowExport);

export default router;
