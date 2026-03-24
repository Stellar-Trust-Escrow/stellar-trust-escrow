/**
 * KYC Service — Sumsub integration
 *
 * Handles applicant creation, SDK token generation, and webhook signature verification.
 * Docs: https://developers.sumsub.com/api-reference/
 */

import crypto from 'crypto';
import prisma from '../lib/prisma.js';

const { SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY, SUMSUB_BASE_URL = 'https://api.sumsub.com' } =
  process.env;

const LEVEL_NAME = process.env.SUMSUB_LEVEL_NAME || 'basic-kyc-level';

/** Build a signed Sumsub request (HMAC-SHA256). */
function buildHeaders(method, path, body = '') {
  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = ts + method.toUpperCase() + path + (body ? body : '');
  const signature = crypto
    .createHmac('sha256', SUMSUB_SECRET_KEY)
    .update(payload)
    .digest('hex');

  return {
    'X-App-Token': SUMSUB_APP_TOKEN,
    'X-App-Access-Sig': signature,
    'X-App-Access-Ts': ts,
    'Content-Type': 'application/json',
  };
}

async function sumsubFetch(method, path, body) {
  const bodyStr = body ? JSON.stringify(body) : '';
  const res = await fetch(`${SUMSUB_BASE_URL}${path}`, {
    method,
    headers: buildHeaders(method, path, bodyStr),
    body: bodyStr || undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sumsub ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

/** Create or retrieve a Sumsub applicant for the given Stellar address. */
async function getOrCreateApplicant(address) {
  let record = await prisma.kycVerification.findUnique({ where: { address } });

  if (record?.applicantId) return record;

  const applicant = await sumsubFetch('POST', '/resources/applicants?levelName=' + LEVEL_NAME, {
    externalUserId: address,
  });

  record = await prisma.kycVerification.upsert({
    where: { address },
    update: { applicantId: applicant.id, status: 'Init' },
    create: { address, applicantId: applicant.id, status: 'Init' },
  });

  return record;
}

/** Generate a short-lived SDK access token for the frontend widget. */
async function generateSdkToken(address) {
  const record = await getOrCreateApplicant(address);
  const data = await sumsubFetch(
    'POST',
    `/resources/accessTokens?userId=${record.applicantId}&levelName=${LEVEL_NAME}`,
  );
  return { token: data.token, applicantId: record.applicantId };
}

/** Get current KYC status for an address (from DB, not Sumsub). */
async function getStatus(address) {
  return prisma.kycVerification.findUnique({ where: { address } });
}

/** Get all KYC records for admin review (paginated). */
async function listAll({ skip = 0, take = 20, status } = {}) {
  const where = status ? { status } : {};
  const [data, total] = await prisma.$transaction([
    prisma.kycVerification.findMany({ where, skip, take, orderBy: { updatedAt: 'desc' } }),
    prisma.kycVerification.count({ where }),
  ]);
  return { data, total };
}

/**
 * Process a Sumsub webhook event and update DB status.
 * Returns the updated record.
 */
async function handleWebhook(payload) {
  const { externalUserId, applicantId, type, reviewResult } = payload;

  const statusMap = {
    applicantCreated: 'Init',
    applicantPending: 'Processing',
    applicantReviewed: reviewResult?.reviewAnswer === 'GREEN' ? 'Approved' : 'Declined',
  };

  const newStatus = statusMap[type];
  if (!newStatus) return null; // unhandled event type

  return prisma.kycVerification.upsert({
    where: { address: externalUserId },
    update: {
      applicantId,
      status: newStatus,
      reviewResult: reviewResult?.reviewAnswer ?? null,
      rejectLabels: reviewResult?.rejectLabels ?? [],
    },
    create: {
      address: externalUserId,
      applicantId,
      status: newStatus,
      reviewResult: reviewResult?.reviewAnswer ?? null,
      rejectLabels: reviewResult?.rejectLabels ?? [],
    },
  });
}

/**
 * Verify Sumsub webhook HMAC signature.
 * Returns true if valid.
 */
function verifyWebhookSignature(rawBody, signature) {
  const expected = crypto
    .createHmac('sha256', SUMSUB_SECRET_KEY)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

export default {
  generateSdkToken,
  getStatus,
  listAll,
  handleWebhook,
  verifyWebhookSignature,
};
