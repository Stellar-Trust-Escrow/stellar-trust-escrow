import { webhookQueue } from './index.js';

export async function enqueueWebhookDelivery(deliveryId, url, payload, headers = {}, options = {}) {
  return webhookQueue.add(
    'webhook',
    { deliveryId, url, payload, headers },
    {
      attempts: options.attempts ?? 5,
      backoff: options.backoff ?? { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );
}

export default {
  enqueueWebhookDelivery,
};
