import kycService from '../../services/kycService.js';
import crypto from 'crypto';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns true when the raw body HMAC-SHA256 matches the signature header
 * sent by Sumsub.
 *
 * The SUMSUB_WEBHOOK_SECRET env var must be set; if it isn't the webhook
 * endpoint will reject every request with a 500 rather than silently accept
 * unsigned payloads.
 *
 * @param {string} rawBody
 * @param {string} signature  — value of x-payload-digest header
 * @returns {boolean}
 */
function isValidSumsubSignature(rawBody, signature) {
  const secret = process.env.SUMSUB_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}

// ── Controller ─────────────────────────────────────────────────────────────

/**
 * POST /api/kyc/token
 *
 * Generates a short-lived Sumsub SDK access token that the frontend widget
 * uses to start a verification session.
 *
 * Expects `req.body.address` — validated upstream by stellarAddressBody().
 */
async function getToken(req, res) {
  const { address } = req.body;

  try {
    // kycService.createToken() is expected to call the Sumsub REST API and
    // return { token, userId }.  If it doesn't exist yet the caught error
    // will surface a clear "not implemented" message.
    if (typeof kycService.createToken !== 'function') {
      return res.status(501).json({
        error: 'KYC token generation is not yet implemented.',
        code: 'KYC_TOKEN_NOT_IMPLEMENTED',
      });
    }

    const result = await kycService.createToken(address);

    return res.json({ token: result.token, userId: result.userId });
  } catch (err) {
    // Distinguish Sumsub API errors from unexpected internal failures so
    // the caller can act on the message.
    const isExternalApiError =
      err.response !== undefined || // axios-style HTTP error
      err.message?.toLowerCase().includes('sumsub');

    if (isExternalApiError) {
      return res.status(502).json({
        error: 'Failed to obtain a KYC token from the identity provider.',
        code: 'KYC_PROVIDER_ERROR',
        // Only include the HTTP status from the upstream response; never the
        // raw body which may contain internal URLs or credentials.
        ...(err.response?.status && { providerStatus: err.response.status }),
      });
    }

    // Database / unexpected error
    console.error('[kycController.getToken]', err);
    return res.status(500).json({
      error: 'An unexpected error occurred while generating the KYC token.',
      code: 'KYC_TOKEN_INTERNAL_ERROR',
    });
  }
}

/**
 * GET /api/kyc/status/:address
 *
 * Returns the KYC verification status stored in the database for the given
 * Stellar address.  The address is validated upstream by stellarAddressParam().
 */
async function getStatus(req, res) {
  const { address } = req.params;

  try {
    const status = await kycService.getStatus(address);

    if (status === 'not_started') {
      // Distinguish "no record" from a DB failure so the frontend can show
      // the correct onboarding prompt.
      return res.status(404).json({
        error: `No KYC record found for address ${address}.`,
        code: 'KYC_RECORD_NOT_FOUND',
        address,
      });
    }

    return res.json({ address, status });
  } catch (err) {
    const isNotFoundError =
      err.code === 'P2025' || // Prisma "record not found"
      err.message?.includes('No KYC record');

    if (isNotFoundError) {
      return res.status(404).json({
        error: `No KYC record found for address ${address}.`,
        code: 'KYC_RECORD_NOT_FOUND',
        address,
      });
    }

    console.error('[kycController.getStatus]', err);
    return res.status(500).json({
      error: `Failed to retrieve KYC status for address ${address}.`,
      code: 'KYC_STATUS_INTERNAL_ERROR',
    });
  }
}

/**
 * POST /api/kyc/webhook
 *
 * Receives verification lifecycle events from Sumsub and updates the
 * KYC record in the database accordingly.
 *
 * The raw request body must be captured before JSON parsing (captureRawBody
 * middleware in kycRoutes.js handles this) so we can verify the HMAC
 * signature.
 */
async function webhook(req, res) {
  // ── Signature verification ───────────────────────────────────────────────
  if (!process.env.SUMSUB_WEBHOOK_SECRET) {
    console.error('[kycController.webhook] SUMSUB_WEBHOOK_SECRET is not set');
    return res.status(500).json({
      error: 'Webhook processing is misconfigured: the signing secret is not set.',
      code: 'KYC_WEBHOOK_SECRET_MISSING',
    });
  }

  const signature = req.headers['x-payload-digest'];
  if (!signature) {
    return res.status(400).json({
      error: "Missing required header 'x-payload-digest' for signature verification.",
      code: 'KYC_WEBHOOK_MISSING_SIGNATURE',
    });
  }

  if (!isValidSumsubSignature(req.rawBody ?? '', signature)) {
    return res.status(400).json({
      error: 'Webhook signature verification failed. The payload may have been tampered with.',
      code: 'KYC_WEBHOOK_INVALID_SIGNATURE',
    });
  }

  // ── Payload validation ────────────────────────────────────────────────────
  const { type, applicantId, reviewResult, externalUserId } = req.body ?? {};

  if (!type || !applicantId) {
    return res.status(400).json({
      error: "Webhook payload is missing required fields: 'type' and 'applicantId'.",
      code: 'KYC_WEBHOOK_MALFORMED_PAYLOAD',
    });
  }

  // ── Event processing ──────────────────────────────────────────────────────
  try {
    if (type === 'applicantReviewed') {
      const reviewAnswer = reviewResult?.reviewAnswer;

      if (!reviewAnswer) {
        return res.status(400).json({
          error: "Webhook payload for 'applicantReviewed' is missing 'reviewResult.reviewAnswer'.",
          code: 'KYC_WEBHOOK_MISSING_REVIEW_ANSWER',
        });
      }

      const address = externalUserId; // We store the Stellar address as externalUserId

      if (!address) {
        return res.status(400).json({
          error:
            "Webhook payload is missing 'externalUserId'. Cannot map applicant to a Stellar address.",
          code: 'KYC_WEBHOOK_MISSING_EXTERNAL_USER_ID',
        });
      }

      if (reviewAnswer === 'GREEN') {
        await kycService.approve(address);
      } else if (reviewAnswer === 'RED') {
        const rejectLabels = reviewResult?.rejectLabels?.join(', ') ?? 'unspecified';
        await kycService.reject(address, `Rejected by identity provider: ${rejectLabels}`);
      }
      // Other reviewAnswer values (e.g. 'YELLOW' for retry) are acknowledged
      // but no DB update is performed — Sumsub will send a final GREEN/RED.
    }
    // Other event types (applicantCreated, etc.) are acknowledged silently.

    return res.json({ received: true });
  } catch (err) {
    const isNotFoundError = err.code === 'P2025' || err.message?.includes('No KYC record');

    if (isNotFoundError) {
      // The applicant doesn't have a local record yet — this can happen if
      // the webhook fires before the user completes the frontend flow.
      return res.status(422).json({
        error: `Cannot update KYC record: no local record exists for address derived from applicant '${applicantId}'.`,
        code: 'KYC_WEBHOOK_APPLICANT_NOT_FOUND',
      });
    }

    console.error('[kycController.webhook]', err);
    return res.status(500).json({
      error: 'Failed to process the webhook event due to an internal error.',
      code: 'KYC_WEBHOOK_INTERNAL_ERROR',
    });
  }
}

/**
 * GET /api/kyc/admin
 *
 * Returns a paginated list of all KYC records.  Requires admin authentication
 * (enforced upstream by adminAuth middleware in kycRoutes.js).
 */
async function adminList(req, res) {
  const { status, page = '1', limit = '20' } = req.query;

  const VALID_STATUSES = ['Pending', 'Init', 'Processing', 'Approved', 'Declined'];

  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Invalid status filter '${status}'. Allowed values: ${VALID_STATUSES.join(', ')}.`,
      code: 'KYC_ADMIN_INVALID_STATUS',
      allowedValues: VALID_STATUSES,
    });
  }

  const parsedPage = parseInt(page, 10);
  const parsedLimit = parseInt(limit, 10);

  if (isNaN(parsedPage) || parsedPage < 1) {
    return res.status(400).json({
      error: `Invalid 'page' parameter: '${page}'. Must be a positive integer.`,
      code: 'KYC_ADMIN_INVALID_PAGE',
    });
  }

  if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return res.status(400).json({
      error: `Invalid 'limit' parameter: '${limit}'. Must be an integer between 1 and 100.`,
      code: 'KYC_ADMIN_INVALID_LIMIT',
    });
  }

  try {
    if (typeof kycService.listAll !== 'function') {
      return res.status(501).json({
        error: 'Admin KYC list is not yet implemented.',
        code: 'KYC_ADMIN_LIST_NOT_IMPLEMENTED',
      });
    }

    const { records, total } = await kycService.listAll({
      status,
      page: parsedPage,
      limit: parsedLimit,
    });

    return res.json({
      data: records,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (err) {
    console.error('[kycController.adminList]', err);
    return res.status(500).json({
      error: 'Failed to retrieve KYC records due to an internal error.',
      code: 'KYC_ADMIN_LIST_INTERNAL_ERROR',
    });
  }
}

const kycController = { getToken, getStatus, webhook, adminList };

export default kycController;
