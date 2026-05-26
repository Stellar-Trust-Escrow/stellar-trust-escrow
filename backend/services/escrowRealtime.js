import { pool } from '../api/websocket/handlers.js';
import cache from '../lib/cache.js';

const ESCROW_TOPIC_PREFIX = 'escrow:';

/**
 * Topic name for WebSocket room subscriptions for a given escrow id.
 * @param {bigint | number | string} escrowId
 */
export function escrowTopic(escrowId) {
  return `${ESCROW_TOPIC_PREFIX}${String(escrowId)}`;
}

/**
 * Push an escrow update to all clients subscribed to that escrow room,
 * and invalidate REST cache for the escrow detail + milestone list prefixes.
 *
 * @param {bigint | number | string} escrowId
 * @param {Record<string, unknown>} payload — serialisable event summary
 * @returns {number} number of sockets that received the message
 */
export function broadcastEscrowUpdate(escrowId, payload) {
  const idStr = String(escrowId);
  const topic = escrowTopic(escrowId);

  void cache.invalidate(`escrows:${idStr}`);
  void cache.invalidatePrefix(`escrows:${idStr}:`);
  void cache.invalidate(`disputes:${idStr}`);

  return pool.broadcast(topic, {
    ...payload,
    escrowId: idStr,
    ts: new Date().toISOString(),
  });
}
