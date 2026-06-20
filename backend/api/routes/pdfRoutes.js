/**
 * PDF Routes
 *
 * Mounted at /api/escrows (alongside existing escrow routes).
 *
 * POST /api/escrows/:id/generate-pdf  — generate & store contract PDF
 * POST /api/escrows/:id/sign-pdf      — record cryptographic wallet signature
 */

import express from 'express';
import authMiddleware from '../middleware/auth.js';
import {
  generatePdf,
  signPdfHandler,
  validateEscrowId,
  validateSignPdf,
} from '../controllers/pdfController.js';

const router = express.Router();
router.use(authMiddleware);

router.post('/:id/generate-pdf', validateEscrowId, generatePdf);
router.post('/:id/sign-pdf', validateEscrowId, validateSignPdf, signPdfHandler);

export default router;
