import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { createModuleLogger } from '../../config/logger.js';
import prisma from '../../lib/prisma.js';

const log = createModuleLogger('websocket');

const HEARTBEAT_INTERVAL_MS = parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS || '30000', 10);
const MAX_CONNECTIONS = parseInt(process.env.WS_MAX_CONNECTIONS || '100', 10);
const REQUIRE_PARTY =
  String(process.env.WS_ESCROW_SUBSCRIBE_REQUIRE_PARTY || '').toLowerCase() === 'true';

const WS_OPEN = 1; // WebSocket.OPEN — numeric constant, safe in all environments

const ESCROW_TOPIC_RE = /^escrow:(\d+)$/;

function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || 'http://localhost:3000';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Verify JWT from ?token= query param on the upgrade request.
 * Returns decoded payload or null on failure.
 */
function verifyUpgradeJwt(request) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) return null;
    const secret = process.env.JWT_ACCESS_SECRET || 'fallback_access_secret';
    const decoded = jwt.verify(token, secret);
    if (decoded.type !== 'access') return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Reject upgrade if JWT is invalid or origin is not allowed.
 * Returns decoded user payload on success, null on rejection.
 */
export function assertWebSocketUpgradeAllowed(request, socket) {
  const allowed = parseAllowedOrigins();
  const origin = request.headers.origin;
  if (origin && allowed.length > 0 && !allowed.includes(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return null;
  }

  const user = verifyUpgradeJwt(request);
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return null;
  }

  return user;
}

/**
 * When REQUIRE_PARTY is true, only client/freelancer on the escrow may join escrow:<id>.
 */
export async function assertEscrowSubscriptionAllowed(topic, address) {
  const m = topic.match(ESCROW_TOPIC_RE);
  if (!m) return true;
  if (!REQUIRE_PARTY) return true;
  if (!address || typeof address !== 'string') return false;

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
  if (ws.readyState === WS_OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

export const metricsEmitter = new EventEmitter();

class WebSocketPool {
  constructor() {
    // id -> { ws, topics: Set, isAlive: boolean, user: { userId, walletAddress, ...claims } }
    this.connections = new Map();
    // userId -> QueuedMessage[]
    this.messageQueues = new Map();
    this.peakConnections = 0;
    this.totalConnected = 0;
    this.totalDisconnected = 0;
    this.totalTerminatedByTimeout = 0;
    this.heartbeatInterval = null;
  }

  addConnection(ws, req, user = null) {
    if (this.connections.size >= MAX_CONNECTIONS) {
      log.warn({ message: 'ws_max_connections', max: MAX_CONNECTIONS });
      ws.close(1013, 'Try again later. Max capacity reached.');
      return null;
    }

    const id = randomUUID();
    ws.isAlive = true;

    const meta = {
      ws,
      topics: new Set(),
      connectedAt: Date.now(),
      ip: req.socket?.remoteAddress,
      user,
    };

    this.connections.set(id, meta);
    this.totalConnected++;
    if (this.connections.size > this.peakConnections) {
      this.peakConnections = this.connections.size;
    }

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('close', () => { this.removeConnection(id); });
    ws.on('error', (err) => { log.error({ message: 'ws_socket_error', id, err: err.message }); });
    ws.on('message', (data) => {
      this.handleIncomingMessage(id, ws, data).catch((err) =>
        log.error({ message: 'ws_message_error', id, err: err.message }),
      );
    });

    if (!this.heartbeatInterval) this.startHeartbeat();

    // Flush any queued messages for this user
    if (user?.userId) this.flushQueue(id);

    this._emitMetrics();
    return id;
  }

  async handleIncomingMessage(connectionId, ws, data) {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      log.warn({ message: 'ws_invalid_json', connectionId });
      return;
    }

    if (message.type === 'subscribe' && message.topic) {
      try {
        const conn = this.connections.get(connectionId);
        const address = conn?.user?.walletAddress;
        const allowed = await assertEscrowSubscriptionAllowed(message.topic, address);
        if (!allowed) {
          sendJson(ws, { type: 'error', code: 'subscription_denied', topic: message.topic });
          return;
        }
        this.subscribe(connectionId, message.topic);
        sendJson(ws, { type: 'subscribed', topic: message.topic });
      } catch (err) {
        log.error({ message: 'ws_subscribe_failed', connectionId, err: err.message });
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
      if (this.connections.size === 0) this.stopHeartbeat();
      this._emitMetrics();
    }
  }

  subscribe(id, topic) {
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
      if (conn.topics.has(topic) && conn.ws.readyState === WS_OPEN) {
        conn.ws.send(messageStr);
        sentCount++;
      }
    }
    return sentCount;
  }

  /**
   * Broadcast an escrow lifecycle event.
   * Open connections receive it immediately; disconnected users have it queued.
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
      if (!conn.topics.has(topic) && !conn.topics.has('user:all')) continue;

      if (conn.ws.readyState === WS_OPEN) {
        conn.ws.send(messageStr);
      } else {
        const userId = conn.user?.userId;
        if (userId == null) continue;
        if (!this.messageQueues.has(userId)) this.messageQueues.set(userId, []);
        const queue = this.messageQueues.get(userId);
        if (queue.length >= 50) queue.shift();
        queue.push({ ...message, queuedAt: Date.now() });
      }
    }
  }

  /**
   * Flush queued messages for the user associated with connection `id`.
   */
  flushQueue(id) {
    const conn = this.connections.get(id);
    if (!conn || conn.ws.readyState !== WS_OPEN) return;
    const userId = conn.user?.userId;
    if (userId == null) return;
    const queue = this.messageQueues.get(userId);
    if (!queue || queue.length === 0) return;

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
      for (const [id, conn] of this.connections.entries()) {
        if (!conn.ws.isAlive) {
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
 */
export function broadcastEscrowEvent(escrowId, eventType, status) {
  pool.broadcastEscrowEvent(escrowId, eventType, status);
}

/**
 * Attaches a WebSocket server to the given HTTP server.
 * Handles JWT auth on upgrade; rejects unauthenticated connections with 401.
 */
export function createWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url, `http://${request.headers.host}`);
    if (pathname !== '/api/ws') {
      socket.destroy();
      return;
    }

    if (pool.connections.size >= MAX_CONNECTIONS) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      socket.destroy();
      return;
    }

    const user = assertWebSocketUpgradeAllowed(request, socket);
    if (!user) return; // socket already destroyed by assertWebSocketUpgradeAllowed

    request.user = user;
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, request) => {
    const id = pool.addConnection(ws, request, request.user || null);
    if (id) {
      sendJson(ws, {
        type: 'welcome',
        id,
        message: 'Connected to Stellar Trust Escrow WebSocket Server',
      });
    }
  });

  wss.on('close', () => { pool.stopHeartbeat(); });

  return wss;
}

export function broadcastToDispute(disputeId, message) {
  const topic = `dispute:${disputeId}`;
  const payload = JSON.stringify({ ...message, topic, timestamp: new Date().toISOString() });
  let sentCount = 0;
  for (const [id, conn] of pool.connections) {
    if (conn.topics.has(topic)) {
      try {
        conn.ws.send(payload);
        sentCount++;
      } catch (err) {
        log.error({ message: 'ws_broadcast_dispute_error', id, err: err.message });
      }
    }
  }
  return sentCount;
}
