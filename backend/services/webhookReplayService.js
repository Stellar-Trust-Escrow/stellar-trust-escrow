'use strict';

/**
 * Webhook Event Replay Service
 *
 * Provides tooling to re-deliver failed webhook deliveries within a date range,
 * using a Redis Bloom filter to prevent duplicate re-deliveries and writing an
 * audit trail for every replay attempt.
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Redis Bloom filter stub — expects a real ioredis / bloom-filter client to be
// injected in production; the default export is a safe no-op stub.
// ---------------------------------------------------------------------------
const bloomFilter = {
  /**
   * @param {string} key
   * @returns {Promise<boolean>} true if the key is (probably) already present.
   */
  async exists(key) {
    return false; // stub — always returns false in test/dev environments
  },

  /**
   * @param {string} key
   * @returns {Promise<void>}
   */
  async add(key) {
    // stub — no-op
  },
};

/**
 * Deliver a single webhook payload to its configured endpoint.
 *
 * @param {object} delivery - The WebhookDelivery record from the database.
 * @param {number} attempt - Which retry attempt this is (1-based).
 * @returns {Promise<'success'|'failure'>}
 */
async function deliverWebhook(delivery, attempt = 1) {
  const BASE_DELAY_MS = 500;
  const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // exponential backoff

  if (attempt > 1) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  try {
    await axios.post(delivery.endpointUrl, delivery.payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': delivery.signature || '',
        'X-Replay-Attempt': String(attempt),
      },
      timeout: 10_000,
    });
    return 'success';
  } catch (_err) {
    return 'failure';
  }
}

/**
 * Write an audit log entry for a replay attempt.
 *
 * @param {string} deliveryId - The ID of the WebhookDelivery being replayed.
 * @param {'success'|'failure'|'skipped'} status - Outcome of the attempt.
 * @returns {Promise<void>}
 */
async function logReplay(deliveryId, status) {
  if (!deliveryId || typeof deliveryId !== 'string') {
    throw new TypeError('logReplay: deliveryId must be a non-empty string');
  }
  const validStatuses = ['success', 'failure', 'skipped'];
  if (!validStatuses.includes(status)) {
    throw new TypeError(`logReplay: status must be one of ${validStatuses.join(', ')}`);
  }

  await prisma.webhookReplayAudit.create({
    data: {
      deliveryId,
      status,
      replayedAt: new Date(),
    },
  });
}

/**
 * Replay all failed webhook deliveries that were originally attempted within
 * the specified date range. A Redis Bloom filter prevents re-delivering any
 * delivery that has already been replayed in this service's lifetime.
 *
 * @param {Date|string} fromDate - Inclusive start of the query window.
 * @param {Date|string} toDate   - Inclusive end of the query window.
 * @param {object}      [options]
 * @param {number}      [options.maxAttempts=3]  - Max retry attempts per delivery.
 * @param {number}      [options.batchSize=50]   - How many deliveries to process at once.
 * @returns {Promise<{replayed: number, skipped: number, failed: number}>}
 */
async function replayFailedDeliveries(fromDate, toDate, options = {}) {
  const { maxAttempts = 3, batchSize = 50 } = options;

  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const to = toDate instanceof Date ? toDate : new Date(toDate);

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw new TypeError('replayFailedDeliveries: fromDate and toDate must be valid dates');
  }
  if (from > to) {
    throw new RangeError('replayFailedDeliveries: fromDate must be before or equal to toDate');
  }

  let replayed = 0;
  let skipped = 0;
  let failed = 0;
  let cursor = null;

  console.log(`[webhookReplayService] Starting replay from ${from.toISOString()} to ${to.toISOString()}`);

  // Paginate through failed deliveries to avoid loading everything into memory
  while (true) {
    const deliveries = await prisma.webhookDelivery.findMany({
      where: {
        status: 'failed',
        attemptedAt: { gte: from, lte: to },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: batchSize,
    });

    if (deliveries.length === 0) break;
    cursor = deliveries[deliveries.length - 1].id;

    for (const delivery of deliveries) {
      const alreadyReplayed = await bloomFilter.exists(delivery.id);
      if (alreadyReplayed) {
        console.log(`[webhookReplayService] Skipping ${delivery.id} (Bloom filter hit)`);
        await logReplay(delivery.id, 'skipped');
        skipped++;
        continue;
      }

      let outcome = 'failure';
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        outcome = await deliverWebhook(delivery, attempt);
        if (outcome === 'success') break;
        console.warn(
          `[webhookReplayService] Delivery ${delivery.id} attempt ${attempt}/${maxAttempts} failed`,
        );
      }

      // Record in Bloom filter regardless of outcome so we never double-deliver
      await bloomFilter.add(delivery.id);
      await logReplay(delivery.id, outcome);

      // Update the DB record to reflect the replay result
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: outcome === 'success' ? 'replayed' : 'replay_failed',
          lastReplayedAt: new Date(),
        },
      });

      if (outcome === 'success') {
        replayed++;
      } else {
        failed++;
      }
    }

    if (deliveries.length < batchSize) break;
  }

  const summary = { replayed, skipped, failed };
  console.log(`[webhookReplayService] Replay complete:`, summary);
  return summary;
}

module.exports = {
  replayFailedDeliveries,
  logReplay,
  // Exported for testing / DI
  _bloomFilter: bloomFilter,
  _deliverWebhook: deliverWebhook,
};
