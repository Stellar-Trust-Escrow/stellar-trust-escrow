/**
 * PDF Controller
 *
 * Handles:
 *   POST /api/escrows/:id/generate-pdf  — generate & store the contract PDF
 *   POST /api/escrows/:id/sign-pdf      — verify wallet signature and record it
 *   GET  /api/escrows/:id/pdf           — return a pre-signed download URL
 */

import { body, param, validationResult } from 'express-validator';
import { generateEscrowPdf, signPdf } from '../../services/pdfGenerator.js';
import { logControllerError } from '../../config/logger.js';

// ── Validators ────────────────────────────────────────────────────────────────

export const validateEscrowId = [
  param('id').isString().notEmpty().withMessage('Escrow ID is required'),
];

export const validateSignPdf = [
  body('walletAddress').isString().notEmpty().withMessage('walletAddress is required'),
  body('signature').isString().notEmpty().withMessage('signature is required'),
];

function handleErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: 'Validation failed', details: errors.array() });
    return true;
  }
  return false;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /api/escrows/:id/generate-pdf
 * Generates the PDF contract and returns the download URL and hash.
 */
export async function generatePdf(req, res) {
  if (handleErrors(req, res)) return;
  try {
    const result = await generateEscrowPdf(req.params.id);
    res.status(201).json(result);
  } catch (err) {
    logControllerError('pdfController.generatePdf', err);
    const status = err.statusCode ?? 500;
    res.status(status).json({ error: err.message });
  }
}

/**
 * POST /api/escrows/:id/sign-pdf
 * Verifies the wallet signature over the PDF hash and records it.
 */
export async function signPdfHandler(req, res) {
  if (handleErrors(req, res)) return;
  try {
    const { walletAddress, signature } = req.body;
    const result = await signPdf(req.params.id, walletAddress, signature);
    res.json(result);
  } catch (err) {
    logControllerError('pdfController.signPdf', err);
    const status = err.statusCode ?? 500;
    res.status(status).json({ error: err.message });
  }
}

export default { generatePdf, signPdfHandler, validateEscrowId, validateSignPdf };
