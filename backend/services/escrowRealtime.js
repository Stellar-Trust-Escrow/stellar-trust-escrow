/**
 * Escrow Realtime Publisher
 *
 * Thin fire-and-forget bridge that fans domain events out to realtime
 * consumers (WebSocket clients, webhooks) over a Redis pub/sub channel.
 *
 * `escrowService` calls `emitEscrowEvent` after a DB transaction commits. If
 * publishing fails it must NOT roll back the committed write — the caller is
 * responsible for recording the failure in the `failed_events` table.
 *
 * @module services/escrowRealtime
 */

import { createClient } from 'redis';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('service.escrowRealtime');

export const EVENTS_CHANNEL = process.env.ESCROW_EVENTS_CHANNEL || 'escrow:events';
export const UPDATES_CHANNEL = process.env.ESCROW_UPDATES_CHANNEL || 'escrow:updates';

let _client = null;

function getClient() {
  if (!_client) {
    _client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    _client.on('error', (err) => log.error({ message: 'redis_error', error: err.message }));
  }
  return _client;
}

/**
 * Publish a domain event to the events channel. Resolves once the publish is
 * acknowledged by Redis; rejects if Redis is unavailable so the caller can
 * fall back to the failed-events table.
 *
 * @param {object} event - serialisable domain event
 * @returns {Promise<{ channel: string }>}
 */
export async function emitEscrowEvent(event) {
  const client = getClient();
  const payload = JSON.stringify({ ...event, emittedAt: Date.now() });
  await client.publish(EVENTS_CHANNEL, payload);
  return { channel: EVENTS_CHANNEL };
}

/**
 * Broadcast a lightweight escrow state update (used by the indexer / websocket
 * layer). Same semantics as emitEscrowEvent.
 *
 * @param {object} update
 * @returns {Promise<{ channel: string }>}
 */
export async function broadcastEscrowUpdate(update) {
  const client = getClient();
  const payload = JSON.stringify({ ...update, emittedAt: Date.now() });
  await client.publish(UPDATES_CHANNEL, payload);
  return { channel: UPDATES_CHANNEL };
}

export default { emitEscrowEvent, broadcastEscrowUpdate, EVENTS_CHANNEL, UPDATES_CHANNEL };
