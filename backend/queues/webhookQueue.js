import { webhookQueue } from './index.js';
import { getLogger } from '../config/logger.js';
import { BACKOFF_BASE_MS, MAX_DELIVERY_ATTEMPTS } from '../services/webhookService.js';

const log = getLogger();

const REMOVE_ON_FAIL_KEEP = parseInt(process.env.WEBHOOK_KEEP_FAILED_JOBS ?? '100', 10);

export async function enqueueWebhookDelivery({
  deliveryId,
  endpointId,
  url,
  payload,
  headers = {},
}) {
  log.debug({
    type: 'webhook_enqueue',
    deliveryId,
    endpointId,
    attempts: MAX_DELIVERY_ATTEMPTS,
    backoffDelayMs: BACKOFF_BASE_MS,
  });

  return webhookQueue.add(
    'webhook-delivery',
    { deliveryId, endpointId, url, payload, headers },
    {
      attempts: MAX_DELIVERY_ATTEMPTS,
      backoff: { type: 'exponential', delay: BACKOFF_BASE_MS },
      removeOnComplete: true,
      removeOnFail: REMOVE_ON_FAIL_KEEP,
      jobId: `webhook-delivery:${deliveryId}`,
    },
  );
}

export default {
  enqueueWebhookDelivery,
};
