import crypto from 'crypto';
import { EventEmitter } from 'events';

import prisma from '../lib/prisma.js';
import { withTenantScopeBypassed } from '../lib/tenantContext.js';
import { enqueueWebhookDelivery } from '../queues/webhookQueue.js';

export const webhookEvents = new EventEmitter();

const SIGNATURE_HEADER = 'X-Trustchain-Signature';
const EVENT_HEADER = 'X-Trustchain-Event';
const DELIVERY_ID_HEADER = 'X-Delivery-Id';
export const MAX_DELIVERY_ATTEMPTS = 5;
export const BACKOFF_BASE_MS = 30_000;

const ENCRYPTION_KEY =
  process.env.WEBHOOK_ENCRYPTION_KEY ||
  process.env.MFA_ENCRYPTION_KEY ||
  crypto.randomBytes(32).toString('hex');

function encryptSecret(text) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decryptSecret(text) {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function generateSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function buildWebhookPayload(eventType, payload, deliveryId) {
  return {
    eventType,
    deliveryId,
    timestamp: new Date().toISOString(),
    data: payload,
  };
}

export function calculateRetryDelayMs(attempts) {
  const clamped = Math.max(1, Math.min(attempts, MAX_DELIVERY_ATTEMPTS));
  return BACKOFF_BASE_MS * 2 ** (clamped - 1);
}

export function signPayload(secret, payload) {
  const digest = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  return `sha256=${digest}`;
}

export function verifySignature(secret, payload, signatureHeader) {
  const expected = signPayload(secret, payload);
  const received = signatureHeader?.startsWith('sha256=')
    ? signatureHeader
    : `sha256=${signatureHeader ?? ''}`;
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(received);
  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

export function emitWebhookDeadEvent(delivery) {
  webhookEvents.emit('webhook.dead', {
    deliveryId: delivery.id,
    endpointId: delivery.endpointId,
    eventType: delivery.eventType,
    attempts: delivery.attempts,
  });
}

async function createEndpoint({ url, events, createdBy }) {
  const plainSecret = generateSecret();
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      url: String(url).trim(),
      events,
      secret: encryptSecret(plainSecret),
      createdBy: createdBy || null,
      active: true,
    },
    select: {
      id: true,
      url: true,
      events: true,
      active: true,
      tenantId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return { ...endpoint, secret: plainSecret };
}

async function listEndpoints({ createdBy }) {
  return prisma.webhookEndpoint.findMany({
    where: { createdBy },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      url: true,
      events: true,
      active: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function deleteEndpoint({ id, createdBy }) {
  const deleted = await prisma.webhookEndpoint.deleteMany({
    where: { id, createdBy },
  });
  return deleted.count > 0;
}

async function getDeliveryHistory({ endpointId, createdBy, page = 1, limit = 30 }) {
  const skip = (page - 1) * limit;
  const [deliveries, total] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where: { endpoint: { id: endpointId, createdBy } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        eventType: true,
        status: true,
        attempts: true,
        nextRetryAt: true,
        responseCode: true,
        responseBody: true,
        createdAt: true,
      },
    }),
    prisma.webhookDelivery.count({
      where: { endpoint: { id: endpointId, createdBy } },
    }),
  ]);

  return { page, limit, total, deliveries };
}

async function queueEndpointWebhook(endpoint, payload, eventType) {
  const delivery = await prisma.webhookDelivery.create({
    data: {
      endpointId: endpoint.id,
      eventType,
      payload,
      status: 'pending',
    },
  });

  const signedPayload = buildWebhookPayload(eventType, payload, delivery.id);
  const secret = decryptSecret(endpoint.secret);
  const signature = signPayload(secret, signedPayload);
  const headers = {
    'Content-Type': 'application/json',
    [SIGNATURE_HEADER]: signature,
    [EVENT_HEADER]: eventType,
    [DELIVERY_ID_HEADER]: delivery.id,
  };

  await prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: { payload: signedPayload },
  });

  await enqueueWebhookDelivery({
    deliveryId: delivery.id,
    endpointId: endpoint.id,
    url: endpoint.url,
    payload: signedPayload,
    headers,
  });

  return delivery;
}

async function queueEventWebhooks(eventType, payload) {
  const endpoints = await withTenantScopeBypassed(() =>
    prisma.webhookEndpoint.findMany({
      where: { events: { has: eventType }, active: true },
    }),
  );

  if (endpoints.length === 0) {
    return { queued: 0 };
  }

  const queued = [];
  for (const endpoint of endpoints) {
    const delivery = await queueEndpointWebhook(endpoint, payload, eventType);
    queued.push({ endpointId: endpoint.id, deliveryId: delivery.id });
  }

  return { queued: queued.length, deliveries: queued };
}

async function redeliverDelivery({ endpointId, deliveryId }) {
  const delivery = await prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, endpointId, status: 'dead' },
    include: { endpoint: true },
  });

  if (!delivery) {
    return null;
  }

  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: 'pending',
      attempts: 0,
      nextRetryAt: null,
      responseCode: null,
      responseBody: null,
    },
  });

  const signedPayload = delivery.payload;
  const secret = decryptSecret(delivery.endpoint.secret);
  const signature = signPayload(secret, signedPayload);
  const headers = {
    'Content-Type': 'application/json',
    [SIGNATURE_HEADER]: signature,
    [EVENT_HEADER]: delivery.eventType,
    [DELIVERY_ID_HEADER]: delivery.id,
  };

  await enqueueWebhookDelivery({
    deliveryId: delivery.id,
    endpointId: delivery.endpointId,
    url: delivery.endpoint.url,
    payload: signedPayload,
    headers,
  });

  return delivery;
}

export {
  createEndpoint,
  listEndpoints,
  deleteEndpoint,
  getDeliveryHistory,
  queueEventWebhooks,
  redeliverDelivery,
  buildWebhookPayload,
  SIGNATURE_HEADER,
  EVENT_HEADER,
  DELIVERY_ID_HEADER,
  encryptSecret,
  decryptSecret,
};

export default {
  createEndpoint,
  listEndpoints,
  deleteEndpoint,
  getDeliveryHistory,
  queueEventWebhooks,
  redeliverDelivery,
  signPayload,
  verifySignature,
  calculateRetryDelayMs,
};
