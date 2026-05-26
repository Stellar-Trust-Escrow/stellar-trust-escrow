import crypto from 'crypto';

import {
  __resetForTests,
  enqueueEvent,
  getQueueSnapshot,
} from '../queues/emailQueue.js';

import disputeRaisedTemplate from '../templates/emails/disputeRaised.js';
import escrowStatusChangedTemplate from '../templates/emails/escrowStatusChanged.js';
import milestoneCompletedTemplate from '../templates/emails/milestoneCompleted.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const config = {
  provider: process.env.EMAIL_PROVIDER || 'bullmq',
  fromEmail: process.env.EMAIL_FROM || 'no-reply@stellartrustescrow.local',
  fromName: process.env.EMAIL_FROM_NAME || 'Stellar Trust Escrow',
  baseUrl: process.env.EMAIL_BASE_URL || `http://localhost:${process.env.PORT || 4000}`,
};
const preferences = new Map();

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
  const normalized = assertEmail(email);
  if (!preferences.has(normalized)) {
    preferences.set(normalized, {
      email: normalized,
      unsubscribeToken: createUnsubscribeToken(normalized),
      unsubscribedAt: null,
    });
  }

  return { ...preferences.get(normalized) };
}

async function unsubscribe(email, token, reason = 'user_request') {
  const preference = await ensurePreference(email);
  if (preference.unsubscribeToken !== token) {
    throw new Error('Invalid unsubscribe token');
  }
  const updatedPreference = {
    ...preference,
    unsubscribedAt: new Date().toISOString(),
    reason,
  };
  preferences.set(preference.email, updatedPreference);
  return { ...updatedPreference };
}

async function resubscribe(email) {
  const preference = await ensurePreference(email);
  const updatedPreference = {
    ...preference,
    unsubscribedAt: null,
  };
  preferences.set(preference.email, updatedPreference);
  return { ...updatedPreference };
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

async function queueNotifications(eventType, payload, templateFactory) {
  const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];
  const queued = [];
  const skipped = [];

  for (const recipient of recipients) {
    const preference = await getPreference(recipient.email);

    if (preference.unsubscribedAt) {
      skipped.push({ email: preference.email, reason: 'unsubscribed' });
      continue;
    }

    const message = templateFactory(payload)({
      recipient,
      unsubscribeUrl: buildUnsubscribeUrl(preference.email, preference.unsubscribeToken),
      fromName: config.fromName,
    });

    const result = await enqueueEvent(eventType, {
      ...payload,
      recipients: [recipient],
      message,
    });

    queued.push(...result.accepted.map((entry) => ({ ...entry, recipient: preference.email })));
  }

  return {
    queued: queued.length,
    accepted: queued,
    skipped,
  };
}

async function notifyEscrowStatusChange(payload) {
  return queueNotifications('escrow.status_changed', payload, escrowStatusChangedTemplate);
}

async function notifyMilestoneCompleted(payload) {
  return queueNotifications('milestone.completed', payload, milestoneCompletedTemplate);
}

async function notifyDisputeRaised(payload) {
  return queueNotifications('dispute.raised', payload, disputeRaisedTemplate);
}

function resetEmailServiceForTests() {
  preferences.clear();
  __resetForTests();
}

export { buildUnsubscribeUrl, getPreference, unsubscribe, resubscribe, start };
export {
  resetEmailServiceForTests as __resetForTests,
  getQueueSnapshot,
  notifyDisputeRaised,
  notifyEscrowStatusChange,
  notifyMilestoneCompleted,
};

export default {
  getPreference,
  unsubscribe,
  resubscribe,
  start,
  getQueueSnapshot,
  notifyDisputeRaised,
  notifyEscrowStatusChange,
  notifyMilestoneCompleted,
  __resetForTests: resetEmailServiceForTests,
};
