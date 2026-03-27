import { Worker } from 'bullmq';
import { webhookQueue, connection } from '../queues/index.js';

const webhookWorker = new Worker(
  'webhook',
  async (job) => {
    const { url, payload, headers = {} } = job.data;

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

    console.log(`[WebhookWorker] Delivered to ${url}: ${response.status}`);
  },
  {
    connection,
  },
);

export default webhookWorker;
