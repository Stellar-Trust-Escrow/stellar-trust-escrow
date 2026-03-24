import { randomUUID } from 'crypto';
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

class WebSocketPool {
  constructor() {
    this.connections = new Map(); // id -> { ws, topics: Set, isAlive: boolean }
    this.peakConnections = 0;
    this.totalConnected = 0;
    this.totalDisconnected = 0;
    this.heartbeatInterval = null;
  }

  addConnection(ws, req) {
    if (this.connections.size >= MAX_CONNECTIONS) {
      console.warn(`[WebSocket] Connection rejected: Max capacity reached (${MAX_CONNECTIONS})`);
      ws.close(1013, 'Try again later. Max capacity reached.');
      return null;
    }

    const id = randomUUID();
    const meta = {
      ws,
      topics: new Set(),
      isAlive: true,
      connectedAt: Date.now(),
      ip: req.socket.remoteAddress,
    };

    this.connections.set(id, meta);
    this.totalConnected++;
    if (this.connections.size > this.peakConnections) {
      this.peakConnections = this.connections.size;
    }

    ws.on('pong', () => {
      const conn = this.connections.get(id);
      if (conn) conn.isAlive = true;
    });

    ws.on('close', () => {
      this.removeConnection(id);
    });

    ws.on('error', (err) => {
      console.error(`[WebSocket] ID ${id} error:`, err.message);
    });

    ws.on('message', (data) => {
      void this.handleIncomingMessage(id, ws, data);
    });

    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }

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
    }
  }

  subscribe(id, topic) {
    const conn = this.connections.get(id);
    if (conn) {
      conn.topics.add(topic);
    }
  }

  unsubscribe(id, topic) {
    const conn = this.connections.get(id);
    if (conn) {
      conn.topics.delete(topic);
    }
  }

  broadcast(topic, payload) {
    let sentCount = 0;
    const messageStr = JSON.stringify({ topic, payload });

    for (const [_id, conn] of this.connections.entries()) {
      if (conn.topics.has(topic) && conn.ws.readyState === 1 /* OPEN */) {
        conn.ws.send(messageStr);
        sentCount++;
      }
    }
    return sentCount;
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      const toTerminate = [];
      for (const [id, conn] of this.connections.entries()) {
        if (!conn.isAlive) {
          toTerminate.push(id);
          continue;
        }
        conn.isAlive = false;
        conn.ws.ping();
      }
      for (const id of toTerminate) {
        const conn = this.connections.get(id);
        if (conn) {
          console.log(`[WebSocket] Terminating unresponsive connection ${id}`);
          conn.ws.terminate();
          this.removeConnection(id);
        }
      }
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
      activeConnections: this.connections.size,
      peakConnections: this.peakConnections,
      totalConnected: this.totalConnected,
      totalDisconnected: this.totalDisconnected,
      subscriptionsByTopic: topicCounts,
    };
  }
}

export const pool = new WebSocketPool();

/**
 * Attaches a WebSocket server to the given HTTP server.
 *
 * @param {import('http').Server} httpServer - The running HTTP server
 * @returns {WebSocketServer}
 */
export function createWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url, `http://${request.headers.host}`);

    if (pathname !== '/api/ws') {
      socket.destroy();
      return;
    }

    if (!assertWebSocketUpgradeAllowed(request, socket)) {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, request) => {
    const id = pool.addConnection(ws, request);
    if (id) {
      console.log(`[WebSocket] New connection established: ${id}`);

      sendJson(ws, {
        type: 'welcome',
        id,
        message: 'Connected to Stellar Trust Escrow WebSocket Server',
      });
    }
  });

  wss.on('close', () => {
    pool.stopHeartbeat();
  });

  return wss;
}
