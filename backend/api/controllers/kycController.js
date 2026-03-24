import kycService from '../../services/kycService.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import { ValidationError, UnauthorizedError } from '../../lib/errors.js';
import asyncHandler from '../../lib/asyncHandler.js';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/** POST /api/kyc/token — get Sumsub SDK token for the authenticated user. */
const getToken = asyncHandler(async (req, res) => {
  const { address } = req.body;
  if (!address || !STELLAR_ADDRESS_RE.test(address)) {
    throw new ValidationError('Valid Stellar address required');
  }
  const result = await kycService.generateSdkToken(address);
  res.json(result);
});

/** GET /api/kyc/status/:address — get KYC status for an address. */
const getStatus = asyncHandler(async (req, res) => {
  const { address } = req.params;
  if (!STELLAR_ADDRESS_RE.test(address)) {
    throw new ValidationError('Invalid Stellar address');
  }
  const record = await kycService.getStatus(address);
  if (!record) return res.json({ address, status: 'Pending' });
  res.json(record);
});

/** POST /api/kyc/webhook — Sumsub webhook receiver. */
const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-payload-digest'];
  if (!signature || !kycService.verifyWebhookSignature(req.rawBody, signature)) {
    throw new UnauthorizedError('Invalid webhook signature');
  }
  await kycService.handleWebhook(req.body);
  res.json({ ok: true });
});

/** GET /api/kyc/admin — list all KYC records (admin only). */
const adminList = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { status } = req.query;
  const { data, total } = await kycService.listAll({ skip, take: limit, status });
  res.json(buildPaginatedResponse(data, { total, page, limit }));
});

export default { getToken, getStatus, webhook, adminList };
