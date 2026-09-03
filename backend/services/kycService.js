/**
 * KYC Service
 *
 * All public methods throw typed errors with a `code` property so that the
 * controller can map them to the correct HTTP status without forwarding raw
 * database or provider error messages to the caller.
 *
 * Error codes:
 *  KYC_NOT_FOUND               — no record for the given address
 *  KYC_ALREADY_APPROVED        — record is already in approved state
 *  KYC_ALREADY_SUBMITTED       — record is already pending review
 *  KYC_INVALID_STATUS          — transition not valid from the current state
 *  KYC_WEBHOOK_INVALID_SIGNATURE  — HMAC mismatch
 *  KYC_WEBHOOK_MISSING_EVENT   — webhook payload lacks required reviewResult field
 *  KYC_WEBHOOK_UNSUPPORTED_EVENT — webhook type is not handled
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Typed error factory ───────────────────────────────────────────────────────

/**
 * Create an Error with a stable `code` that controllers can switch on.
 * The message is safe to send to the caller — it does not contain connection
 * strings, SQL, or other server internals.
 */
function kycError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Verify a Sumsub webhook HMAC-SHA256 signature.
 * The secret is read from SUMSUB_WEBHOOK_SECRET; if that env var is unset the
 * check is skipped in non-production environments (handy for local dev).
 */
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.SUMSUB_WEBHOOK_SECRET;

  if (!secret) {
    // Skip verification in dev/test; enforce in production.
    if (process.env.NODE_ENV === 'production') {
      throw kycError(
        'KYC_WEBHOOK_INVALID_SIGNATURE',
        'Webhook signature verification failed: SUMSUB_WEBHOOK_SECRET is not configured.',
      );
    }
    return; // skip in non-production
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks.
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  const lengthsMatch = sigBuf.length === expBuf.length;
  const bytesMatch =
    lengthsMatch && crypto.timingSafeEqual(sigBuf, expBuf);

  if (!bytesMatch) {
    throw kycError(
      'KYC_WEBHOOK_INVALID_SIGNATURE',
      'Webhook signature verification failed: signature does not match.',
    );
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

const kycService = {
  /**
   * Return the current KYC status for an address.
   * Returns 'not_started' when no record exists (not an error).
   */
  async getStatus(address) {
    try {
      const record = await prisma.kycRecord.findUnique({ where: { address } });
      return record ? record.status : 'not_started';
    } catch {
      throw kycError(
        'KYC_DB_ERROR',
        'Unable to retrieve KYC status. Please try again later.',
      );
    }
  },

  /**
   * Submit KYC documents for review.
   * Throws KYC_ALREADY_APPROVED if the address has already been approved.
   */
  async submit(address, documents) {
    let existing;
    try {
      existing = await prisma.kycRecord.findUnique({ where: { address } });
    } catch {
      throw kycError('KYC_DB_ERROR', 'Unable to read KYC record. Please try again later.');
    }

    if (existing?.status === 'approved') {
      throw kycError(
        'KYC_ALREADY_APPROVED',
        `KYC for address ${address} is already approved and cannot be resubmitted.`,
      );
    }

    if (existing?.status === 'pending') {
      throw kycError(
        'KYC_ALREADY_SUBMITTED',
        `KYC for address ${address} is already under review. Please wait for the outcome.`,
      );
    }

    try {
      return await prisma.kycRecord.upsert({
        where: { address },
        update: { status: 'pending', documents, submittedAt: new Date() },
        create: { address, status: 'pending', documents, submittedAt: new Date() },
      });
    } catch {
      throw kycError('KYC_DB_ERROR', 'Unable to submit KYC documents. Please try again later.');
    }
  },

  /**
   * Approve a KYC record.
   * Throws KYC_NOT_FOUND if no record exists for the address.
   * Throws KYC_ALREADY_APPROVED if already in approved state.
   */
  async approve(address) {
    let existing;
    try {
      existing = await prisma.kycRecord.findUnique({ where: { address } });
    } catch {
      throw kycError('KYC_DB_ERROR', 'Unable to read KYC record. Please try again later.');
    }

    if (!existing) {
      throw kycError(
        'KYC_NOT_FOUND',
        `No KYC record found for address ${address}.`,
      );
    }

    if (existing.status === 'approved') {
      throw kycError(
        'KYC_ALREADY_APPROVED',
        `KYC for address ${address} is already approved.`,
      );
    }

    try {
      return await prisma.kycRecord.update({
        where: { address },
        data: { status: 'approved', reviewedAt: new Date() },
      });
    } catch {
      throw kycError('KYC_DB_ERROR', 'Unable to approve KYC record. Please try again later.');
    }
  },

  /**
   * Reject a KYC record with a specific reason.
   * Throws KYC_NOT_FOUND if no record exists for the address.
   */
  async reject(address, reason) {
    let existing;
    try {
      existing = await prisma.kycRecord.findUnique({ where: { address } });
    } catch {
      throw kycError('KYC_DB_ERROR', 'Unable to read KYC record. Please try again later.');
    }

    if (!existing) {
      throw kycError(
        'KYC_NOT_FOUND',
        `No KYC record found for address ${address}.`,
      );
    }

    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      throw kycError(
        'KYC_INVALID_STATUS',
        'A non-empty rejection reason is required.',
      );
    }

    try {
      return await prisma.kycRecord.update({
        where: { address },
        data: { status: 'rejected', rejectionReason: reason.trim(), reviewedAt: new Date() },
      });
    } catch {
      throw kycError('KYC_DB_ERROR', 'Unable to reject KYC record. Please try again later.');
    }
  },

  /**
   * Return true if the address has an approved KYC record.
   */
  async isApproved(address) {
    try {
      const record = await prisma.kycRecord.findUnique({ where: { address } });
      return record?.status === 'approved';
    } catch {
      throw kycError('KYC_DB_ERROR', 'Unable to check KYC approval status. Please try again later.');
    }
  },

  /**
   * Generate a Sumsub SDK access token for the given address.
   * In production this would call the Sumsub REST API; this implementation
   * returns a deterministic placeholder until the integration is wired up.
   */
  async generateToken(address) {
    // Placeholder — replace with actual Sumsub API call when the integration
    // is added. The stub is intentional; no secret is embedded here.
    return `kyc_token_stub_${address}`;
  },

  /**
   * Verify the webhook signature then apply the status update from the payload.
   *
   * Supported reviewResult values (Sumsub convention):
   *   GREEN  → approve the applicant
   *   RED    → reject the applicant (rejectionLabels[0] used as reason)
   */
  async processWebhook(rawBody, signature, payload) {
    verifyWebhookSignature(rawBody, signature);

    const { type, applicantId, reviewResult } = payload ?? {};

    if (!type) {
      throw kycError(
        'KYC_WEBHOOK_MISSING_EVENT',
        "Webhook payload is missing the required 'type' field.",
      );
    }

    if (type !== 'applicantReviewed') {
      // Acknowledge unknown event types without error — Sumsub sends many
      // event types and we only process a subset.
      return { ignored: true, type };
    }

    if (!reviewResult?.reviewAnswer) {
      throw kycError(
        'KYC_WEBHOOK_MISSING_EVENT',
        "Webhook payload is missing 'reviewResult.reviewAnswer'.",
      );
    }

    const address = applicantId; // applicantId is the Stellar address in our flow
    if (!address) {
      throw kycError(
        'KYC_WEBHOOK_MISSING_EVENT',
        "Webhook payload is missing 'applicantId' (Stellar address).",
      );
    }

    const answer = reviewResult.reviewAnswer.toUpperCase();

    if (answer === 'GREEN') {
      return kycService.approve(address);
    }

    if (answer === 'RED') {
      const reason =
        reviewResult.rejectLabels?.[0] ??
        reviewResult.reviewRejectType ??
        'Rejected by KYC provider.';
      return kycService.reject(address, reason);
    }

    throw kycError(
      'KYC_WEBHOOK_UNSUPPORTED_EVENT',
      `Unsupported reviewAnswer value: '${answer}'. Expected GREEN or RED.`,
    );
  },

  /**
   * List all KYC records (admin use only).
   */
  async listAll() {
    try {
      return await prisma.kycRecord.findMany({
        orderBy: { submittedAt: 'desc' },
      });
    } catch {
      throw kycError('KYC_DB_ERROR', 'Unable to list KYC records. Please try again later.');
    }
  },
};

export default kycService;
