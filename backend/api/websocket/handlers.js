import { randomUUID } from 'crypto';
import { WebSocketServer } from 'ws';

const HEARTBEAT_INTERVAL_MS = parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS || '30000', 10);
const HEARTBEAT_TIMEOUT_MS = parseInt(process.env.WS_HEARTBEAT_TIMEOUT_MS || '10000', 10);
const MAX_CONNECTIONS = parseInt(process.env.WS_MAX_CONNECTIONS || '100', 10);

class WebSocketPool {
  constructor() {
    this.connections = new Map(); // id -> { ws, topics, isAlive, pingTimeout, connectedAt, ip, missedPings, totalPings, totalPongs }
    this.peakConnections = 0;
    this.totalConnected = 0;
    this.totalDisconnected = 0;
    this.totalTimeouts = 0;
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
      pingTimeout: null,
      connectedAt: Date.now(),
      ip: req.socket.remoteAddress,
      missedPings: 0,
      totalPings: 0,
      totalPongs: 0,
    };

    this.connections.set(id, meta);
    this.totalConnected++;
    if (this.connections.size > this.peakConnections) {
      this.peakConnections = this.connections.size;
    }

    ws.on('pong', () => {
      const conn = this.connections.get(id);
      if (!conn) return;
      conn.isAlive = true;
      conn.missedPings = 0;
      conn.totalPongs++;
      // Clear the per-ping hard timeout
      if (conn.pingTimeout) {
        clearTimeout(conn.pingTimeout);
        conn.pingTimeout = null;
      }
    });

    ws.on('close', () => this.removeConnection(id));

    ws.on('error', (err) => {
      console.error(`[WebSocket] ID ${id} error:`, err.message);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'subscribe' && message.topic) {
          this.subscribe(id, message.topic);
        } else if (message.type === 'unsubscribe' && message.topic) {
          this.unsubscribe(id, message.topic);
        } else if (message.type === 'ping') {
          // Client-initiated ping — respond immediately
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {
        console.warn(`[WebSocket] Invalid message from ${id}:`, data.toString());
      }
    });

    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }

    return id;
  }

  removeConnection(id) {
    const conn = this.connections.get(id);
    if (conn) {
      if (conn.pingTimeout) clearTimeout(conn.pingTimeout);
      this.connections.delete(id);
      this.totalDisconnected++;
      if (this.connections.size === 0) this.stopHeartbeat();
    }
  }

  _terminateStale(id, conn) {
    console.log(`[WebSocket] Timeout: terminating unresponsive connection ${id} (missed ${conn.missedPings} pings)`);
    this.totalTimeouts++;
    conn.ws.terminate();
    this.removeConnection(id);
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
      if (conn.topics.has(topic) && conn.ws.readyState === 1 /* OPEN */) {
        conn.ws.send(messageStr);
        sentCount++;
      }
    }
    return sentCount;
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      for (const [id, conn] of this.connections.entries()) {
        if (!conn.isAlive) {
          // Pong never arrived from previous cycle — terminate
          this._terminateStale(id, conn);
          continue;
        }

        // Mark as waiting for pong
        conn.isAlive = false;
        conn.missedPings++;
        conn.totalPings++;

        try {
          conn.ws.ping();
        } catch {
          this._terminateStale(id, conn);
          continue;
        }

        // Per-ping hard timeout: terminate if pong doesn't arrive within HEARTBEAT_TIMEOUT_MS
        conn.pingTimeout = setTimeout(() => {
          if (!conn.isAlive) {
            this._terminateStale(id, conn);
          }
        }, HEARTBEAT_TIMEOUT_MS);
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
    let totalMissedPings = 0;
    for (const conn of this.connections.values()) {
      for (const topic of conn.topics) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
      totalMissedPings += conn.missedPings;
    }

    return {
      activeConnections: this.connections.size,
      peakConnections: this.peakConnections,
      totalConnected: this.totalConnected,
      totalDisconnected: this.totalDisconnected,
      totalTimeouts: this.totalTimeouts,
      totalMissedPings,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      subscriptionsByTopic: topicCounts,
    };
  }
}

export const pool = new WebSocketPool();

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
    }
  });

  wss.on('connection', (ws, request) => {
    const id = pool.addConnection(ws, request);
    if (id) {
      console.log(`[WebSocket] New connection established: ${id}`);
      ws.send(
        JSON.stringify({
          type: 'welcome',
          id,
          message: 'Connected to Stellar Trust Escrow WebSocket Server',
          heartbeat: {
            intervalMs: HEARTBEAT_INTERVAL_MS,
            timeoutMs: HEARTBEAT_TIMEOUT_MS,
          },
        }),
      );
    }
  });

  wss.on('close', () => pool.stopHeartbeat());

  return wss;
}
