import { Worker } from 'bullmq';

import prisma from '../lib/prisma.js';
import { connection } from '../queues/index.js';
import {
  calculateRetryDelayMs,
  emitWebhookDeadEvent,
  MAX_DELIVERY_ATTEMPTS,
} from '../services/webhookService.js';

export async function processWebhookJob(job) {
  const { url, payload, headers = {}, deliveryId } = job.data;
  const attempts = job.attemptsMade + 1;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.text();

    if (!response.ok) {
      throw Object.assign(new Error(`Webhook failed: ${response.status}`), {
        responseCode: response.status,
        responseBody,
      });
    }

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'delivered',
        responseCode: response.status,
        responseBody,
        attempts,
        nextRetryAt: null,
      },
    });
  } catch (err) {
    const responseCode = err.responseCode ?? null;
    const responseBody = err.responseBody ?? err.message;
    const isTerminal = attempts >= MAX_DELIVERY_ATTEMPTS;
    const nextRetryAt = isTerminal
      ? null
      : new Date(Date.now() + calculateRetryDelayMs(attempts));

    const updated = await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: isTerminal ? 'dead' : 'failed',
        responseCode,
        responseBody,
        attempts,
        nextRetryAt,
      },
    });

    if (isTerminal) {
      emitWebhookDeadEvent(updated);
      return;
    }

    throw err;
  }
}

const webhookWorker =
  process.env.NODE_ENV === 'test'
    ? null
    : new Worker('webhook-delivery', processWebhookJob, {
        connection,
      });

export default webhookWorker;
