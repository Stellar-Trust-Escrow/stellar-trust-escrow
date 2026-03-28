import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { WebSocketServer } from 'ws';
import prisma from '../../lib/prisma.js';

const HEARTBEAT_INTERVAL_MS = parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS || '30000', 10);
const MAX_CONNECTIONS = parseInt(process.env.WS_MAX_CONNECTIONS || '100', 10);
const REQUIRE_PARTY =
  String(process.env.WS_ESCROW_SUBSCRIBE_REQUIRE_PARTY || '').toLowerCase() === 'true';

const ESCROW_TOPIC_RE = /^escrow:(\d+)$/;

function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || 'http://localhost:3000';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Reject upgrade if WS_AUTH_TOKEN is set and query ?token= does not match.
 * Reject if Origin is present and not in ALLOWED_ORIGINS.
 * @returns {boolean} true if the upgrade may proceed
 */
export function assertWebSocketUpgradeAllowed(request, socket) {
  const wsAuth = process.env.WS_AUTH_TOKEN;
  if (wsAuth) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    if (token !== wsAuth) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return false;
    }
  }

  const allowed = parseAllowedOrigins();
  const origin = request.headers.origin;
  if (origin && allowed.length > 0 && !allowed.includes(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return false;
  }

  return true;
}

/**
 * When REQUIRE_PARTY is true, only client/freelancer on the escrow may join escrow:<id>.
 * @param {string} topic
 * @param {string | undefined} address — Stellar public key
 */
export async function assertEscrowSubscriptionAllowed(topic, address) {
  const m = topic.match(ESCROW_TOPIC_RE);
  if (!m) return true;

  if (!REQUIRE_PARTY) return true;

  if (!address || typeof address !== 'string') {
    return false;
  }

  const escrowId = BigInt(m[1]);
  const escrow = await prisma.escrow.findUnique({
    where: { id: escrowId },
    select: { clientAddress: true, freelancerAddress: true },
  });

  if (!escrow) return false;

  const a = address.trim();
  return escrow.clientAddress === a || escrow.freelancerAddress === a;
}

function sendJson(ws, obj) {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(obj));
  }
}

export const metricsEmitter = new EventEmitter();

class WebSocketPool {
  constructor() {
    this.connections = new Map(); // id -> { ws, topics: Set, isAlive: boolean, user: { userId, walletAddress, ...claims } }
    this.messageQueues = new Map(); // userId -> QueuedMessage[]
    this.peakConnections = 0;
    this.totalConnected = 0;
    this.totalDisconnected = 0;
    this.totalTerminatedByTimeout = 0;
    this.heartbeatInterval = null;
  }

  addConnection(ws, req, user = null) {
    if (this.connections.size >= MAX_CONNECTIONS) {
      console.warn(`[WebSocket] Connection rejected: Max capacity reached (${MAX_CONNECTIONS})`);
      ws.close(1013, 'Try again later. Max capacity reached.');
      return null;
    }

    const id = randomUUID();
    ws.isAlive = true;

    const meta = {
      ws,
      topics: new Set(),
      connectedAt: Date.now(),
      ip: req.socket.remoteAddress,
      user, // decoded JWT payload: { userId, walletAddress, ...claims }
    };

    this.connections.set(id, meta);
    this.totalConnected++;
    if (this.connections.size > this.peakConnections) {
      this.peakConnections = this.connections.size;
    }

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('close', () => {
      this.removeConnection(id);
    });

    ws.on('error', (err) => {
      console.error(`[WebSocket] ID ${id} error:`, err.message);
    });

    ws.on('message', (data) => {
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        console.warn(`[WebSocket] Invalid message from ${id}:`, data.toString());
        return;
      }

      if (message.type === 'subscribe' && message.topic) {
        this.subscribe(id, message.topic, prisma).catch((err) => {
          console.error(`[WebSocket] subscribe error for ${id}:`, err.message);
        });
      } else if (message.type === 'unsubscribe' && message.topic) {
        this.unsubscribe(id, message.topic);
      }
      // unknown types are silently ignored (Requirement 3.7)
    });

    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }

    this._emitMetrics();
    return id;
  }

  async handleIncomingMessage(connectionId, ws, data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      console.warn(`[WebSocket] Invalid JSON from ${connectionId}`);
      return;
    }

    if (message.type === 'subscribe' && message.topic) {
      try {
        const allowed = await assertEscrowSubscriptionAllowed(message.topic, message.address);
        if (!allowed) {
          sendJson(ws, {
            type: 'error',
            code: 'subscription_denied',
            topic: message.topic,
          });
          return;
        }
        this.subscribe(connectionId, message.topic);
        sendJson(ws, { type: 'subscribed', topic: message.topic });
      } catch (err) {
        console.error(`[WebSocket] subscribe failed for ${connectionId}:`, err.message);
        sendJson(ws, { type: 'error', code: 'subscription_failed', topic: message.topic });
      }
      return;
    }

    if (message.type === 'unsubscribe' && message.topic) {
      this.unsubscribe(connectionId, message.topic);
      sendJson(ws, { type: 'unsubscribed', topic: message.topic });
      return;
    }

    if (message.type === 'ping') {
      sendJson(ws, { type: 'pong', t: message.t });
    }
  }

  removeConnection(id) {
    if (this.connections.has(id)) {
      const meta = this.connections.get(id);
      meta.topics.clear();
      this.connections.delete(id);
      this.totalDisconnected++;

      if (this.connections.size === 0) {
        this.stopHeartbeat();
      }

      this._emitMetrics();
    }
  }

  async subscribe(id, topic, prisma) {
    const conn = this.connections.get(id);
    if (conn) conn.topics.add(topic);
  }

  unsubscribe(id, topic) {
    const conn = this.connections.get(id);
    if (conn) conn.topics.delete(topic);
  }

  broadcast(topic, payload) {
    let sentCount = 0;
    const messageStr = JSON.stringify({ topic, payload });

    for (const [_id, conn] of this.connections.entries()) {
      if (conn.topics.has(topic) && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(messageStr);
        sentCount++;
      }
    }
    return sentCount;
  }

  /**
   * Broadcast an escrow lifecycle event to all relevant subscribers.
   * Connections that are OPEN receive the message immediately; others have it enqueued.
   *
   * @param {bigint|number|string} escrowId
   * @param {string} eventType  e.g. 'escrow:funded'
   * @param {string} status     EscrowStatus value e.g. 'Active'
   */
  broadcastEscrowEvent(escrowId, eventType, status) {
    const topic = `escrow:${escrowId}`;
    const bigIntReplacer = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);

    const message = {
      topic,
      payload: {
        event: eventType,
        escrowId: String(escrowId),
        status,
        timestamp: new Date().toISOString(),
      },
    };
    const messageStr = JSON.stringify(message, bigIntReplacer);

    for (const [_id, conn] of this.connections.entries()) {
      const subscribedToEscrow = conn.topics.has(topic);
      const subscribedToAll = conn.topics.has('user:all');

      if (!subscribedToEscrow && !subscribedToAll) continue;

      if (conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(messageStr);
      } else {
        // Enqueue for disconnected user
        const userId = conn.user?.userId;
        if (userId == null) continue;

        if (!this.messageQueues.has(userId)) {
          this.messageQueues.set(userId, []);
        }
        const queue = this.messageQueues.get(userId);
        if (queue.length >= 50) {
          queue.shift(); // discard oldest
        }
        queue.push({ ...message, queuedAt: Date.now() });
      }
    }
  }

  /**
   * Flush queued messages for the user associated with connection `id`.
   * Messages are sent in chronological order; the queue is cleared afterwards.
   *
   * @param {string} id  Connection UUID
   */
  flushQueue(id) {
    const conn = this.connections.get(id);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) return;

    const userId = conn.user?.userId;
    if (userId == null) return;

    const queue = this.messageQueues.get(userId);
    if (!queue || queue.length === 0) return;

    // Sort by queuedAt to ensure chronological order
    queue.sort((a, b) => a.queuedAt - b.queuedAt);

    const bigIntReplacer = (_k, v) => (typeof v === 'bigint' ? v.toString() : v);
    for (const msg of queue) {
      const { queuedAt: _dropped, ...wireMsg } = msg;
      conn.ws.send(JSON.stringify(wireMsg, bigIntReplacer));
    }

    this.messageQueues.delete(userId);
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const toTerminate = [];
      for (const [id, conn] of this.connections.entries()) {
        if (!conn.ws.isAlive) {
          console.log(`[WebSocket] Terminating unresponsive connection ${id}`);
          this.totalTerminatedByTimeout++;
          conn.ws.terminate();
          this.removeConnection(id);
          continue;
        }

        conn.ws.isAlive = false;
        conn.ws.ping();
      }

      this._emitMetrics();
    }, HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  getMetrics() {
    const topicCounts = {};
    for (const conn of this.connections.values()) {
      for (const topic of conn.topics) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    }

    return {
      active_connections: this.connections.size,
      total_connections_established: this.totalConnected,
      connections_terminated_by_timeout: this.totalTerminatedByTimeout,
      peakConnections: this.peakConnections,
      totalDisconnected: this.totalDisconnected,
      subscriptionsByTopic: topicCounts,
    };
  }

  _emitMetrics() {
    metricsEmitter.emit('metrics', this.getMetrics());
  }
}

export const pool = new WebSocketPool();

/**
 * Module-level wrapper — called by eventIndexer.js after status-changing transactions.
 *
 * @param {bigint|number|string} escrowId
 * @param {string} eventType  e.g. 'escrow:funded'
 * @param {string} status     EscrowStatus value e.g. 'Active'
 */
export function broadcastEscrowEvent(escrowId, eventType, status) {
  pool.broadcastEscrowEvent(escrowId, eventType, status);
}

/**
 * Attaches a WebSocket server to the given HTTP server.
 *
 * @param {import('http').Server} httpServer
 * @returns {WebSocketServer}
 */
export function createWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url, `http://${request.headers.host}`);

    if (pathname === '/api/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
      return;
    }

    // Reject before handshake if pool is at capacity
    if (pool.connections.size >= MAX_CONNECTIONS) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }

    // Attach decoded user to request for use in connection handler
    request.user = user;

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, request) => {
    const id = pool.addConnection(ws, request, request.user || null);
    if (id) {
      console.log(`[WebSocket] New connection established: ${id}`);
      ws.send(
        JSON.stringify({
          type: 'welcome',
          id,
          message: 'Connected to Stellar Trust Escrow WebSocket Server',
        }),
      );
    }
  });

  wss.on('close', () => {
    pool.stopHeartbeat();
  });

  return wss;
}

export function broadcastToDispute(disputeId, message) {
  const topic = `dispute:${disputeId}`;
  const payload = JSON.stringify({
    ...message,
    topic,
    timestamp: new Date().toISOString()
  });

  let sentCount = 0;
  for (const [id, conn] of pool.connections) {
    if (conn.topics.has(topic)) {
      try {
        conn.ws.send(payload);
        sentCount++;
      } catch (error) {
        console.error(`[WebSocket] Failed to send to ${id}:`, error.message);
      }
    }
  }

  console.log(`[WebSocket] Broadcast to dispute:${disputeId} sent to ${sentCount} clients`);
  return sentCount;
}
