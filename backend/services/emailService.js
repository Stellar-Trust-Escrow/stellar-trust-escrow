import crypto from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import disputeRaisedTemplate from '../templates/emails/disputeRaised.js';
import escrowStatusChangedTemplate from '../templates/emails/escrowStatusChanged.js';
import milestoneCompletedTemplate from '../templates/emails/milestoneCompleted.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const STATE_FILE = path.join(DATA_DIR, 'email-notifications.json');

const DEFAULT_STATE = {
  preferences: {},
  queue: [],
  sentTimestamps: [],
  deliveries: [],
};

const config = {
  provider: process.env.EMAIL_PROVIDER || 'console',
  fromEmail: process.env.EMAIL_FROM || 'no-reply@stellartrustescrow.local',
  fromName: process.env.EMAIL_FROM_NAME || 'Stellar Trust Escrow',
  baseUrl: process.env.EMAIL_BASE_URL || `http://localhost:${process.env.PORT || 4000}`,
  rateLimitPerMinute: Number.parseInt(process.env.EMAIL_RATE_LIMIT_PER_MINUTE || '20', 10),
  maxRetries: Number.parseInt(process.env.EMAIL_MAX_RETRIES || '3', 10),
  retryBaseDelayMs: Number.parseInt(process.env.EMAIL_RETRY_BASE_DELAY_MS || '15000', 10),
  processIntervalMs: Number.parseInt(process.env.EMAIL_QUEUE_POLL_INTERVAL_MS || '5000', 10),
  sendgridApiKey: process.env.SENDGRID_API_KEY || '',
};

let state = null;
let stateLoaded = false;
let processing = false;
let queueTimer = null;

function nowIso() {
  return new Date().toISOString();
}

function sanitizeEmail(email) {
  return String(email || '').trim().toLowerCase();
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
    .createHmac('sha256', process.env.EMAIL_UNSUBSCRIBE_SECRET || 'stellar-trust-escrow-email-secret')
    .update(email)
    .digest('hex');
}

async function persistState() {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state ?? DEFAULT_STATE, null, 2));
}

async function loadState() {
  if (stateLoaded) return state;

  await mkdir(DATA_DIR, { recursive: true });

  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    state = { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    state = structuredClone(DEFAULT_STATE);
    await persistState();
  }

  state.preferences ??= {};
  state.queue ??= [];
  state.sentTimestamps ??= [];
  state.deliveries ??= [];
  stateLoaded = true;
  return state;
}

async function ensurePreference(email) {
  await loadState();

  const normalized = assertEmail(email);
  const existing = state.preferences[normalized];
  if (existing) return existing;

  const preference = {
    email: normalized,
    unsubscribeToken: createUnsubscribeToken(normalized),
    unsubscribedAt: null,
    unsubscribeReason: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  state.preferences[normalized] = preference;
  await persistState();
  return preference;
}

function buildUnsubscribeUrl(email, token) {
  const params = new URLSearchParams({ email, token });
  return `${config.baseUrl}/api/notifications/unsubscribe?${params.toString()}`;
}

function createTemplate(eventType, payload) {
  switch (eventType) {
    case 'escrow.status_changed':
      return escrowStatusChangedTemplate(payload);
    case 'milestone.completed':
      return milestoneCompletedTemplate(payload);
    case 'dispute.raised':
      return disputeRaisedTemplate(payload);
    default:
      throw new Error(`Unsupported notification event type: ${eventType}`);
  }
}

function buildMessage(eventType, payload, recipient, preference) {
  const template = createTemplate(eventType, payload);
  const content = template({
    recipient,
    unsubscribeUrl: buildUnsubscribeUrl(recipient.email, preference.unsubscribeToken),
    fromName: config.fromName,
  });

  return {
    eventType,
    to: {
      email: recipient.email,
      name: recipient.name || recipient.address || recipient.email,
    },
    subject: content.subject,
    text: content.text,
    html: content.html,
  };
}

function nextRetryAt(attempts) {
  const delayMs = config.retryBaseDelayMs * 2 ** Math.max(0, attempts - 1);
  return new Date(Date.now() + delayMs).toISOString();
}

function pruneSentTimestamps() {
  const threshold = Date.now() - 60_000;
  state.sentTimestamps = state.sentTimestamps.filter((timestamp) => timestamp > threshold);
}

async function sendWithProvider(message) {
  if (config.provider === 'console' || !config.sendgridApiKey) {
    console.log('[EmailService] Console delivery', {
      to: message.to.email,
      subject: message.subject,
      eventType: message.eventType,
    });
    return {
      provider: 'console',
      messageId: `console-${crypto.randomUUID()}`,
    };
  }

  if (config.provider !== 'sendgrid') {
    throw new Error(`Unsupported email provider: ${config.provider}`);
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.sendgridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: message.to.email, name: message.to.name }],
          subject: message.subject,
        },
      ],
      from: {
        email: config.fromEmail,
        name: config.fromName,
      },
      content: [
        { type: 'text/plain', value: message.text },
        { type: 'text/html', value: message.html },
      ],
      custom_args: {
        eventType: message.eventType,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SendGrid request failed: ${response.status} ${errorText}`);
  }

  return {
    provider: 'sendgrid',
    messageId: response.headers.get('x-message-id') || `sendgrid-${crypto.randomUUID()}`,
  };
}

async function processQueue() {
  await loadState();
  if (processing) return;

  processing = true;
  try {
    pruneSentTimestamps();

    const readyJobs = state.queue
      .filter((job) => job.status === 'queued' && new Date(job.availableAt).getTime() <= Date.now())
      .sort((left, right) => new Date(left.availableAt).getTime() - new Date(right.availableAt).getTime());

    for (const job of readyJobs) {
      pruneSentTimestamps();
      if (state.sentTimestamps.length >= config.rateLimitPerMinute) break;

      job.status = 'processing';
      job.updatedAt = nowIso();
      await persistState();

      try {
        const result = await sendWithProvider(job.message);
        state.sentTimestamps.push(Date.now());
        state.deliveries.unshift({
          id: job.id,
          email: job.message.to.email,
          eventType: job.message.eventType,
          sentAt: nowIso(),
          provider: result.provider,
          providerMessageId: result.messageId,
        });
        state.deliveries = state.deliveries.slice(0, 100);
        job.status = 'sent';
        job.sentAt = nowIso();
        job.updatedAt = nowIso();
      } catch (error) {
        job.attempts += 1;
        job.lastError = error.message;
        job.updatedAt = nowIso();

        if (job.attempts >= config.maxRetries) {
          job.status = 'failed';
        } else {
          job.status = 'queued';
          job.availableAt = nextRetryAt(job.attempts);
        }
      }

      await persistState();
    }
  } finally {
    processing = false;
  }
}

async function enqueueEvent(eventType, payload) {
  await loadState();

  const accepted = [];
  const skipped = [];

  for (const rawRecipient of payload.recipients || []) {
    const email = assertEmail(rawRecipient.email);
    const preference = await ensurePreference(email);

    if (preference.unsubscribedAt) {
      skipped.push({ email, reason: 'unsubscribed' });
      continue;
    }

    const recipient = { ...rawRecipient, email };
    const job = {
      id: crypto.randomUUID(),
      status: 'queued',
      attempts: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      availableAt: nowIso(),
      message: buildMessage(eventType, payload, recipient, preference),
    };

    state.queue.push(job);
    accepted.push({ id: job.id, email, eventType });
  }

  await persistState();
  await processQueue();

  return {
    queued: accepted.length,
    accepted,
    skipped,
  };
}

async function unsubscribe(email, token, reason = 'user_request') {
  const preference = await ensurePreference(email);
  if (preference.unsubscribeToken !== token) {
    throw new Error('Invalid unsubscribe token');
  }

  preference.unsubscribedAt = nowIso();
  preference.unsubscribeReason = reason;
  preference.updatedAt = nowIso();
  await persistState();
  return preference;
}

async function resubscribe(email) {
  const preference = await ensurePreference(email);
  preference.unsubscribedAt = null;
  preference.unsubscribeReason = null;
  preference.updatedAt = nowIso();
  await persistState();
  return preference;
}

async function getPreference(email) {
  return ensurePreference(email);
}

async function getQueueSnapshot() {
  await loadState();
  return {
    queue: state.queue,
    deliveries: state.deliveries,
  };
}

async function notifyEscrowStatusChange(payload) {
  return enqueueEvent('escrow.status_changed', payload);
}

async function notifyMilestoneCompleted(payload) {
  return enqueueEvent('milestone.completed', payload);
}

async function notifyDisputeRaised(payload) {
  return enqueueEvent('dispute.raised', payload);
}

async function start() {
  await loadState();
  if (!queueTimer) {
    queueTimer = setInterval(() => {
      processQueue().catch((error) => {
        console.error('[EmailService] Queue processing failed:', error.message);
      });
    }, config.processIntervalMs);
  }

  return {
    provider: config.provider,
    fromEmail: config.fromEmail,
    rateLimitPerMinute: config.rateLimitPerMinute,
  };
}

async function stop() {
  if (queueTimer) {
    clearInterval(queueTimer);
    queueTimer = null;
  }
}

function __resetForTests() {
  state = structuredClone(DEFAULT_STATE);
  stateLoaded = true;
  processing = false;
  if (queueTimer) {
    clearInterval(queueTimer);
    queueTimer = null;
  }
}

export {
  __resetForTests,
  buildUnsubscribeUrl,
  enqueueEvent,
  getPreference,
  getQueueSnapshot,
  notifyDisputeRaised,
  notifyEscrowStatusChange,
  notifyMilestoneCompleted,
  processQueue,
  resubscribe,
  start,
  stop,
  unsubscribe,
};

export default {
  enqueueEvent,
  getPreference,
  getQueueSnapshot,
  notifyDisputeRaised,
  notifyEscrowStatusChange,
  notifyMilestoneCompleted,
  processQueue,
  resubscribe,
  start,
  stop,
  unsubscribe,
};
