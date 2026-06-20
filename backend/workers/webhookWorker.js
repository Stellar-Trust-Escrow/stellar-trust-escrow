import { Worker } from 'bullmq';
import prisma from '../lib/prisma.js';
import { connection } from '../queues/index.js';

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

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Webhook failed: ${response.status} ${errorText}`);
    }

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'success',
        responseCode: response.status,
        attempts,
        lastAttemptAt: new Date(),
      },
    });

    console.log(`[WebhookWorker] Delivered to ${url}: ${response.status}`);
  } catch (err) {
    const isTerminal = attempts >= (job.opts.attempts ?? 1);
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: isTerminal ? 'failed' : 'pending',
        errorMessage: err.message,
        attempts,
        lastAttemptAt: new Date(),
      },
    });
    throw err;
  }
}

const webhookWorker =
  process.env.NODE_ENV === 'test'
    ? null
    : new Worker('webhook', processWebhookJob, {
        connection,
      });

export default webhookWorker;
