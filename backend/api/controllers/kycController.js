import crypto from 'crypto';
import * as kycService from '../../services/kycService.js';

/**
 * Verify Sumsub webhook HMAC-SHA256 signature.
 * The signature comes in the X-App-Token header and is compared against
 * HMAC-SHA256(secret, rawBody).
 */
function verifyHmac(rawBody, token) {
  const secret = process.env.SUMSUB_WEBHOOK_SECRET || 'test-secret';
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token || '', 'hex'));
  } catch {
    return false;
  }
}

const kycController = {
  /** POST /token — generate Sumsub SDK access token */
  getToken: async (req, res) => {
    try {
      const address = req.body?.address || req.user?.stellarAddress || req.user?.address;
      const result = await kycService.initiateKyc({
        userId: req.user?.id,
        address,
        tenantId: req.tenantId,
      });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  },

  /** GET /status/:address — return KYC status */
  getStatus: async (req, res) => {
    try {
      const address = req.params?.address || req.user?.stellarAddress || req.user?.address;
      const record = await kycService.getKycStatus({ address, tenantId: req.tenantId });
      res.json(record);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  },

  /** POST /webhook — Sumsub webhook (no auth, raw body) */
  webhook: async (req, res) => {
    try {
      const rawBody = req.rawBody || '';
      const token = req.headers['x-app-token'] || '';

      if (!verifyHmac(rawBody, token)) {
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }

      let payload;
      try {
        payload = typeof req.body === 'object' ? req.body : JSON.parse(rawBody);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
      }

      const { applicantId, type: eventType, reviewResult } = payload;
      const reviewAnswer = reviewResult?.reviewAnswer;
      const rejectionLabels = reviewResult?.rejectLabels ?? [];

      const result = await kycService.processWebhook({
        applicantId,
        eventType,
        reviewAnswer,
        rejectionLabels,
        rawPayload: payload,
        tenantId: req.tenantId,
      });

      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  },

  /** POST /admin/override — force KYC status (admin only) */
  adminOverride: async (req, res) => {
    try {
      const { targetAddress, newStatus } = req.body;
      const adminId = req.admin?.adminId || req.adminId;
      const result = await kycService.adminOverride({
        userId: req.user?.id,
        targetAddress,
        newStatus,
        tenantId: req.tenantId,
        adminId,
      });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  },

  /** GET /admin/queue — list pending/declined KYC (admin only) */
  adminList: async (req, res) => {
    try {
      const page = parseInt(req.query?.page || '1', 10);
      const limit = parseInt(req.query?.limit || '20', 10);
      const result = await kycService.listPending({ tenantId: req.tenantId, page, limit });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  },

  // Aliases for router compatibility
  get: async (req, res) => {
    const address = req.params?.address || req.user?.stellarAddress || req.user?.address;
    try {
      const record = await kycService.getKycStatus({ address, tenantId: req.tenantId });
      res.json(record);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  },

  post: async (req, res) => {
    try {
      const address = req.body?.address || req.user?.stellarAddress || req.user?.address;
      const result = await kycService.initiateKyc({
        userId: req.user?.id,
        address,
        tenantId: req.tenantId,
      });
      res.json(result);
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message, code: err.code });
    }
  },
};

export default kycController;
