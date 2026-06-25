import { webhookQueue } from './index.js';
import { getLogger } from '../config/logger.js';

const log = getLogger();

const MAX_RETRY_ATTEMPTS = parseInt(process.env.WEBHOOK_MAX_RETRY_ATTEMPTS ?? '5', 10);
const BACKOFF_BASE_DELAY_MS = parseInt(process.env.WEBHOOK_BACKOFF_BASE_MS ?? '5000', 10);

// Keep the last N failed jobs visible in the BullMQ dashboard before eviction.
// Higher values aid debugging at the cost of Redis memory.
const REMOVE_ON_FAIL_KEEP = parseInt(process.env.WEBHOOK_KEEP_FAILED_JOBS ?? '100', 10);

export async function enqueueWebhookDelivery(deliveryId, url, payload, headers = {}, options = {}) {
  const attempts = options.attempts ?? MAX_RETRY_ATTEMPTS;
  const backoffDelay = options.backoff?.delay ?? BACKOFF_BASE_DELAY_MS;

  log.debug({
    type: 'webhook_enqueue',
    deliveryId,
    attempts,
    backoffDelayMs: backoffDelay,
  });

  return webhookQueue.add(
    'webhook',
    { deliveryId, url, payload, headers },
    {
      attempts,
      backoff: options.backoff ?? { type: 'exponential', delay: backoffDelay },
      removeOnComplete: true,
      removeOnFail: REMOVE_ON_FAIL_KEEP,
      // Job ID is deterministic so re-enqueuing the same delivery after a
      // worker crash is idempotent — BullMQ will de-duplicate by job ID.
      jobId: `webhook:${deliveryId}`,
    },
  );
}

export default {
  enqueueWebhookDelivery,
};
