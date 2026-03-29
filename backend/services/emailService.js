import crypto from 'crypto';

import { emailQueue } from '../queues/emailQueue.js';

import { createModuleLogger } from '../config/logger.js';
import disputeRaisedTemplate from '../templates/emails/disputeRaised.js';
import escrowStatusChangedTemplate from '../templates/emails/escrowStatusChanged.js';
import milestoneCompletedTemplate from '../templates/emails/milestoneCompleted.js';

const EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;

const config = {
  provider: process.env.EMAIL_PROVIDER || 'bullmq',
  fromEmail: process.env.EMAIL_FROM || 'no-reply@stellartrustescrow.local',
  fromName: process.env.EMAIL_FROM_NAME || 'Stellar Trust Escrow',
  baseUrl: process.env.EMAIL_BASE_URL || `http://localhost:${process.env.PORT || 4000}`,
};

function sanitizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function assertEmail(email) {
  const normalized = sanitizeEmail(email);
  if (!EMAIL_RE.test(normalized)) {
    throw new Error('A valid email address is required');
  }
  return normalized;
}

function createUnsubscribeToken(email) {
  return crypto
    .createHmac(
      'sha256',
      process.env.EMAIL_UNSUBSCRIBE_SECRET || 'stellar-trust-escrow-email-secret',
    )
    .update(email)
    .digest('hex');
}

async function ensurePreference(email) {
  // Stub - migrate full logic later or use DB
  const normalized = assertEmail(email);
  return {
    email: normalized,
    unsubscribeToken: createUnsubscribeToken(normalized),
    unsubscribedAt: null,
  };
}

async function unsubscribe(email, token, reason = 'user_request') {
  const preference = await ensurePreference(email);
  if (preference.unsubscribeToken !== token) {
    throw new Error('Invalid unsubscribe token');
  }
  // Stub - update DB later
  return preference;
}

async function resubscribe(email) {
  const preference = await ensurePreference(email);
  // Stub
  return preference;
}

async function getPreference(email) {
  return ensurePreference(email);
}

function buildUnsubscribeUrl(email, token) {
  const params = new URLSearchParams({ email, token });
  return `${config.baseUrl}/api/notifications/unsubscribe?${params.toString()}`;
}

async function start() {
  console.log('[EmailService] BullMQ queues ready');
  return {
    provider: config.provider,
  };
}

export { buildUnsubscribeUrl, getPreference, unsubscribe, resubscribe, start };

export default {
  getPreference,
  unsubscribe,
  resubscribe,
  start,
};

export {
  getQueueSnapshot,
  notifyEscrowStatusChange,
  notifyMilestoneCompleted,
  notifyDisputeRaised,
} from '../queues/emailQueue.js';
