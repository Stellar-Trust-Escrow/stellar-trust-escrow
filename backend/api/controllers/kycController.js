/**
 * KYC Controller
 *
 * Handles all KYC-related HTTP endpoints. Each handler surfaces a specific,
 * actionable error message to the caller while never leaking secrets, raw DB
 * errors, or internal stack traces.
 *
 * Error classification:
 *  - 400  BAD_REQUEST        — caller supplied invalid input
 *  - 404  NOT_FOUND          — address has no KYC record
 *  - 409  ALREADY_APPROVED   — attempt to re-approve or re-submit
 *  - 401  UNAUTHORIZED       — webhook signature verification failed
 *  - 500  INTERNAL_ERROR     — unexpected server-side failure (details logged, not sent)
 */

import kycService from '../../services/kycService.js';
import { logControllerError } from '../../config/logger.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map kycService error codes to HTTP status + safe client message.
 * The raw error (with stack) is only written to the server log.
 */
function resolveServiceError(err, operation, req) {
  logControllerError(`kyc.${operation}`, err, req);

  // Errors thrown intentionally by kycService carry a `code` property.
  switch (err.code) {
    case 'KYC_NOT_FOUND':
      return { status: 404, error: err.message, code: err.code };
    case 'KYC_ALREADY_APPROVED':
      return { status: 409, error: err.message, code: err.code };
    case 'KYC_ALREADY_SUBMITTED':
      return { status: 409, error: err.message, code: err.code };
    case 'KYC_INVALID_STATUS':
      return { status: 400, error: err.message, code: err.code };
    case 'KYC_WEBHOOK_INVALID_SIGNATURE':
      return { status: 401, error: err.message, code: err.code };
    case 'KYC_WEBHOOK_MISSING_EVENT':
      return { status: 400, error: err.message, code: err.code };
    case 'KYC_WEBHOOK_UNSUPPORTED_EVENT':
      return { status: 400, error: err.message, code: err.code };
    default:
      // Do NOT forward unknown error messages — they may contain connection
      // strings, SQL, or other sensitive internals.
      return {
        status: 500,
        error: 'An unexpected error occurred while processing the KYC request.',
        code: 'INTERNAL_ERROR',
      };
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * POST /api/kyc/token
 * Generate a Sumsub SDK access token for the frontend verification widget.
 * Body: { address: string }
 */
async function getToken(req, res) {
  const { address } = req.body;

  if (!address) {
    return res.status(400).json({
      error: 'address is required to generate a KYC token.',
      code: 'MISSING_ADDRESS',
    });
  }

  try {
    const token = await kycService.generateToken(address);
    return res.status(200).json({ token });
  } catch (err) {
    const { status, error, code } = resolveServiceError(err, 'getToken', req);
    return res.status(status).json({ error, code });
  }
}

/**
 * GET /api/kyc/status/:address
 * Return the current KYC verification status for a Stellar address.
 */
async function getStatus(req, res) {
  const { address } = req.params;

  try {
    const status = await kycService.getStatus(address);
    return res.status(200).json({ address, status });
  } catch (err) {
    const { status: httpStatus, error, code } = resolveServiceError(err, 'getStatus', req);
    return res.status(httpStatus).json({ error, code });
  }
}

/**
 * POST /api/kyc/webhook
 * Sumsub webhook receiver — verifies HMAC signature then updates KYC status.
 */
async function webhook(req, res) {
  const signature = req.headers['x-app-token'];
  const rawBody = req.rawBody ?? '';

  if (!signature) {
    return res.status(401).json({
      error: 'Webhook signature header (x-app-token) is missing.',
      code: 'KYC_WEBHOOK_MISSING_SIGNATURE',
    });
  }

  try {
    await kycService.processWebhook(rawBody, signature, req.body);
    return res.status(200).json({ received: true });
  } catch (err) {
    const { status, error, code } = resolveServiceError(err, 'webhook', req);
    return res.status(status).json({ error, code });
  }
}

/**
 * GET /api/kyc/admin
 * List all KYC records (admin only).
 */
async function adminList(req, res) {
  try {
    const records = await kycService.listAll();
    return res.status(200).json({ records });
  } catch (err) {
    const { status, error, code } = resolveServiceError(err, 'adminList', req);
    return res.status(status).json({ error, code });
  }
}

const kycController = {
  getToken,
  getStatus,
  webhook,
  adminList,
};

export default kycController;
