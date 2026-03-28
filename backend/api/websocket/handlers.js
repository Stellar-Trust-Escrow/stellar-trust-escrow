import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { WebSocketServer } from 'ws';

const HEARTBEAT_INTERVAL_MS = parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS || '30000', 10);
const MAX_CONNECTIONS = parseInt(process.env.WS_MAX_CONNECTIONS || '100', 10);

export const metricsEmitter = new EventEmitter();

class WebSocketPool {
  constructor() {
    this.connections = new Map(); // id -> { ws, topics: Set, isAlive: boolean }
    this.peakConnections = 0;
    this.totalConnected = 0;
    this.totalDisconnected = 0;
    this.totalTerminatedByTimeout = 0;
    this.heartbeatInterval = null;
  }

  addConnection(ws, req) {
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
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'subscribe' && message.topic) {
          this.subscribe(id, message.topic);
        } else if (message.type === 'unsubscribe' && message.topic) {
          this.unsubscribe(id, message.topic);
        }
      } catch {
        console.warn(`[WebSocket] Invalid message from ${id}:`, data.toString());
      }
    });

    if (!this.heartbeatInterval) {
      this.startHeartbeat();
    }

    this._emitMetrics();
    return id;
  }

  removeConnection(id) {
    if (this.connections.has(id)) {
      this.connections.delete(id);
      this.totalDisconnected++;

      if (this.connections.size === 0) {
        this.stopHeartbeat();
      }

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
        }),
      );
    }
  });

  wss.on('close', () => {
    pool.stopHeartbeat();
  });

  return wss;
}
