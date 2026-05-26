// Set up env vars before any imports
process.env.WS_MAX_CONNECTIONS = '2';
process.env.WS_HEARTBEAT_INTERVAL_MS = '1000';

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const { pool, assertWebSocketUpgradeAllowed } = await import('../api/websocket/handlers.js');

describe('WebSocket Pool', () => {
  beforeEach(() => {
    pool.connections.clear();
    pool.messageQueues.clear();
    pool.peakConnections = 0;
    pool.totalConnected = 0;
    pool.totalDisconnected = 0;
    pool.totalTerminatedByTimeout = 0;
    pool.stopHeartbeat();
  });

  afterEach(() => {
    pool.stopHeartbeat();
    jest.useRealTimers();
  });

  const createMockWs = (readyState = 1) => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    terminate: jest.fn(),
    ping: jest.fn(),
    readyState,
  });

  const createMockReq = () => ({
    socket: { remoteAddress: '127.0.0.1' },
  });

  describe('addConnection & removeConnection', () => {
    it('successfully adds a connection and returns a UUID', () => {
      const ws = createMockWs();
      const id = pool.addConnection(ws, createMockReq());

      expect(typeof id).toBe('string');
      expect(pool.connections.size).toBe(1);
      expect(ws.isAlive).toBe(true);
      expect(ws.on).toHaveBeenCalledWith('pong', expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('rejects connection if MAX_CONNECTIONS is reached', () => {
      pool.addConnection(createMockWs(), createMockReq());
      pool.addConnection(createMockWs(), createMockReq());

      const ws3 = createMockWs();
      const id3 = pool.addConnection(ws3, createMockReq());

      expect(id3).toBeNull();
      expect(pool.connections.size).toBe(2);
      expect(ws3.close).toHaveBeenCalledWith(1013, expect.any(String));
    });

    it('cleans up when removeConnection is called', () => {
      const id = pool.addConnection(createMockWs(), createMockReq());
      pool.removeConnection(id);

      expect(pool.connections.size).toBe(0);
      expect(pool.totalDisconnected).toBe(1);
    });

    it('flushes queued messages for the user on reconnect', () => {
      const userId = 'user-42';
      pool.messageQueues.set(userId, [
        { topic: 'escrow:1', payload: { event: 'escrow:funded' }, queuedAt: 1000 },
        { topic: 'escrow:1', payload: { event: 'escrow:released' }, queuedAt: 2000 },
      ]);

      const ws = createMockWs();
      pool.addConnection(ws, createMockReq(), { userId });

      // Both queued messages should have been sent
      expect(ws.send).toHaveBeenCalledTimes(2);
      expect(pool.messageQueues.has(userId)).toBe(false);
    });
  });

  describe('pub/sub & broadcast', () => {
    it('allows subscribing and unsubscribing from topics', () => {
      const id = pool.addConnection(createMockWs(), createMockReq());

      pool.subscribe(id, 'escrow:123');
      expect(pool.connections.get(id).topics.has('escrow:123')).toBe(true);

      pool.unsubscribe(id, 'escrow:123');
      expect(pool.connections.get(id).topics.has('escrow:123')).toBe(false);
    });

    it('broadcasts only to subscribers of the specific topic', () => {
      const ws1 = createMockWs();
      const id1 = pool.addConnection(ws1, createMockReq());

      const ws2 = createMockWs();
      const id2 = pool.addConnection(ws2, createMockReq());

      pool.subscribe(id1, 'topic:A');
      pool.subscribe(id2, 'topic:B');

      const sentCount = pool.broadcast('topic:A', { msg: 'hello A' });

      expect(sentCount).toBe(1);
      expect(ws1.send).toHaveBeenCalledWith(
        JSON.stringify({ topic: 'topic:A', payload: { msg: 'hello A' } }),
      );
      expect(ws2.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcastEscrowEvent', () => {
    it('sends to subscribers of the escrow topic', () => {
      const ws = createMockWs();
      const id = pool.addConnection(ws, createMockReq());
      pool.subscribe(id, 'escrow:99');

      pool.broadcastEscrowEvent(99n, 'escrow:funded', 'Active');

      expect(ws.send).toHaveBeenCalledTimes(1);
      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.topic).toBe('escrow:99');
      expect(msg.payload.event).toBe('escrow:funded');
      expect(msg.payload.status).toBe('Active');
    });

    it('sends to user:all subscribers', () => {
      const ws = createMockWs();
      const id = pool.addConnection(ws, createMockReq());
      pool.subscribe(id, 'user:all');

      pool.broadcastEscrowEvent(7n, 'escrow:disputed', 'Disputed');

      expect(ws.send).toHaveBeenCalledTimes(1);
      const msg = JSON.parse(ws.send.mock.calls[0][0]);
      expect(msg.payload.event).toBe('escrow:disputed');
    });

    it('queues message for disconnected user', () => {
      const ws = createMockWs(3); // CLOSED
      const id = pool.addConnection(ws, createMockReq(), { userId: 'user-7' });
      pool.subscribe(id, 'escrow:5');

      pool.broadcastEscrowEvent(5n, 'escrow:released', 'Completed');

      expect(pool.messageQueues.get('user-7')).toHaveLength(1);
      expect(pool.messageQueues.get('user-7')[0].payload.event).toBe('escrow:released');
    });

    it('caps queue at 50 messages, discarding oldest', () => {
      const ws = createMockWs(3); // CLOSED
      const id = pool.addConnection(ws, createMockReq(), { userId: 'user-8' });
      pool.subscribe(id, 'escrow:6');

      for (let i = 0; i < 55; i++) {
        pool.broadcastEscrowEvent(6n, `escrow:funded`, 'Active');
      }

      expect(pool.messageQueues.get('user-8')).toHaveLength(50);
    });
  });

  describe('heartbeat', () => {
    it('terminates a silent client that does not respond to pings', () => {
      jest.useFakeTimers();

      const ws = createMockWs();
      const id = pool.addConnection(ws, createMockReq());

      jest.advanceTimersByTime(1100);
      expect(ws.ping).toHaveBeenCalled();
      expect(ws.isAlive).toBe(false);

      jest.advanceTimersByTime(1100);
      expect(ws.terminate).toHaveBeenCalled();
      expect(pool.connections.has(id)).toBe(false);
      expect(pool.totalTerminatedByTimeout).toBe(1);
    });

    it('keeps alive a client that responds to pings with pongs', () => {
      jest.useFakeTimers();

      const ws = createMockWs();
      const id = pool.addConnection(ws, createMockReq());
      const onPong = ws.on.mock.calls.find((call) => call[0] === 'pong')[1];

      jest.advanceTimersByTime(1100);
      expect(ws.ping).toHaveBeenCalledTimes(1);
      expect(ws.isAlive).toBe(false);

      onPong();
      expect(ws.isAlive).toBe(true);

      jest.advanceTimersByTime(1100);
      expect(ws.terminate).not.toHaveBeenCalled();
      expect(pool.connections.has(id)).toBe(true);
      expect(ws.ping).toHaveBeenCalledTimes(2);

      onPong();
      jest.advanceTimersByTime(1100);
      expect(ws.terminate).not.toHaveBeenCalled();
      expect(pool.connections.has(id)).toBe(true);
    });
  });

  describe('metrics', () => {
    it('returns correct metrics payload with required field names', () => {
      const ws1 = createMockWs();
      const id1 = pool.addConnection(ws1, createMockReq());

      const ws2 = createMockWs();
      pool.addConnection(ws2, createMockReq());

      pool.subscribe(id1, 'testTopic');
      pool.removeConnection(id1);

      const metrics = pool.getMetrics();

      expect(metrics).toMatchObject({
        active_connections: 1,
        total_connections_established: 2,
        connections_terminated_by_timeout: 0,
        peakConnections: 2,
        totalDisconnected: 1,
      });
    });

    it('increments connections_terminated_by_timeout on heartbeat termination', () => {
      jest.useFakeTimers();

      pool.addConnection(createMockWs(), createMockReq());
      pool.addConnection(createMockWs(), createMockReq());

      jest.advanceTimersByTime(1100);
      jest.advanceTimersByTime(1100);

      expect(pool.getMetrics().connections_terminated_by_timeout).toBe(2);
      expect(pool.getMetrics().active_connections).toBe(0);
    });

    it('reflects live state', () => {
      pool.addConnection(createMockWs(), createMockReq());
      expect(pool.getMetrics().active_connections).toBe(1);
    });
  });

  describe('graceful shutdown', () => {
    it('clears the heartbeat interval on stopHeartbeat', () => {
      pool.addConnection(createMockWs(), createMockReq());
      expect(pool.heartbeatInterval).not.toBeNull();

      pool.stopHeartbeat();
      expect(pool.heartbeatInterval).toBeNull();
    });
  });

  describe('assertWebSocketUpgradeAllowed', () => {
    it('rejects when JWT is missing', () => {
      const socket = { write: jest.fn(), destroy: jest.fn() };
      const request = {
        url: '/api/ws',
        headers: { host: 'localhost:4000' },
      };
      const result = assertWebSocketUpgradeAllowed(request, socket);
      expect(result).toBeNull();
      expect(socket.write).toHaveBeenCalledWith('HTTP/1.1 401 Unauthorized\r\n\r\n');
      expect(socket.destroy).toHaveBeenCalled();
    });

    it('rejects when origin is not allowed', () => {
      process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
      const socket = { write: jest.fn(), destroy: jest.fn() };
      const request = {
        url: '/api/ws?token=x',
        headers: { host: 'localhost:4000', origin: 'http://evil.com' },
      };
      const result = assertWebSocketUpgradeAllowed(request, socket);
      expect(result).toBeNull();
      expect(socket.write).toHaveBeenCalledWith('HTTP/1.1 403 Forbidden\r\n\r\n');
    });
  });
});

describe('WebSocket Pool', () => {
  beforeEach(() => {
    pool.connections.clear();
    pool.peakConnections = 0;
    pool.totalConnected = 0;
    pool.totalDisconnected = 0;
    pool.totalTerminatedByTimeout = 0;
    pool.stopHeartbeat();
  });

  afterEach(() => {
    pool.stopHeartbeat();
    jest.useRealTimers();
  });

  const createMockWs = () => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    terminate: jest.fn(),
    ping: jest.fn(),
    readyState: 1, // OPEN
  });

  const createMockReq = () => ({
    socket: { remoteAddress: '127.0.0.1' },
  });

  describe('addConnection & removeConnection', () => {
    it('successfully adds a connection and returns a UUID', () => {
      const ws = createMockWs();
      const id = pool.addConnection(ws, createMockReq());

      expect(typeof id).toBe('string');
      expect(pool.connections.size).toBe(1);
      expect(ws.isAlive).toBe(true);
      expect(ws.on).toHaveBeenCalledWith('pong', expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('rejects connection if MAX_CONNECTIONS is reached', () => {
      pool.addConnection(createMockWs(), createMockReq());
      pool.addConnection(createMockWs(), createMockReq());

      const ws3 = createMockWs();
      const id3 = pool.addConnection(ws3, createMockReq());

      expect(id3).toBeNull();
      expect(pool.connections.size).toBe(2);
      expect(ws3.close).toHaveBeenCalledWith(1013, expect.any(String));
    });

    it('cleans up when removeConnection is called', () => {
      const id = pool.addConnection(createMockWs(), createMockReq());
      pool.removeConnection(id);

      expect(pool.connections.size).toBe(0);
      expect(pool.totalDisconnected).toBe(1);
    });
  });

  describe('pub/sub & broadcast', () => {
    it('allows subscribing and unsubscribing from topics', () => {
      const id = pool.addConnection(createMockWs(), createMockReq());

      pool.subscribe(id, 'escrow:123');
      expect(pool.connections.get(id).topics.has('escrow:123')).toBe(true);

      pool.unsubscribe(id, 'escrow:123');
      expect(pool.connections.get(id).topics.has('escrow:123')).toBe(false);
    });

    it('broadcasts only to subscribers of the specific topic', () => {
      const ws1 = createMockWs();
      const id1 = pool.addConnection(ws1, createMockReq());

      const ws2 = createMockWs();
      const id2 = pool.addConnection(ws2, createMockReq());

      pool.subscribe(id1, 'topic:A');
      pool.subscribe(id2, 'topic:B');

      const sentCount = pool.broadcast('topic:A', { msg: 'hello A' });

      expect(sentCount).toBe(1);
      expect(ws1.send).toHaveBeenCalledWith(
        JSON.stringify({ topic: 'topic:A', payload: { msg: 'hello A' } }),
      );
      expect(ws2.send).not.toHaveBeenCalled();
    });
  });

  describe('heartbeat', () => {
    it('Test 2 (Timeout Detection): terminates a silent client that does not respond to pings', () => {
      jest.useFakeTimers();

      const ws = createMockWs();
      const id = pool.addConnection(ws, createMockReq());

      // First interval: ping sent, isAlive set to false
      jest.advanceTimersByTime(1100);
      expect(ws.ping).toHaveBeenCalled();
      expect(ws.isAlive).toBe(false);

      // Second interval: no pong received — connection must be terminated
      jest.advanceTimersByTime(1100);
      expect(ws.terminate).toHaveBeenCalled();
      expect(pool.connections.has(id)).toBe(false);
      expect(pool.totalTerminatedByTimeout).toBe(1);
    });

    it('Test 1 (Healthy Connection): keeps alive a client that responds to pings with pongs', () => {
      jest.useFakeTimers();

      const ws = createMockWs();
      const id = pool.addConnection(ws, createMockReq());

      // Extract the pong handler registered on the ws object
      const onPong = ws.on.mock.calls.find((call) => call[0] === 'pong')[1];

      // First interval: ping sent, isAlive set to false
      jest.advanceTimersByTime(1100);
      expect(ws.ping).toHaveBeenCalledTimes(1);
      expect(ws.isAlive).toBe(false);

      // Client responds with pong — isAlive restored
      onPong();
      expect(ws.isAlive).toBe(true);

      // Second interval: connection is alive, ping sent again, not terminated
      jest.advanceTimersByTime(1100);
      expect(ws.terminate).not.toHaveBeenCalled();
      expect(pool.connections.has(id)).toBe(true);
      expect(ws.ping).toHaveBeenCalledTimes(2);

      // Third interval: client ponged again — still alive
      onPong();
      jest.advanceTimersByTime(1100);
      expect(ws.terminate).not.toHaveBeenCalled();
      expect(pool.connections.has(id)).toBe(true);
    });
  });

  describe('metrics', () => {
    it('returns correct metrics payload with required field names', () => {
      const ws1 = createMockWs();
      const id1 = pool.addConnection(ws1, createMockReq());

      const ws2 = createMockWs();
      pool.addConnection(ws2, createMockReq());

      pool.subscribe(id1, 'testTopic');
      pool.removeConnection(id1);

      const metrics = pool.getMetrics();

      expect(metrics).toMatchObject({
        active_connections: 1,
        total_connections_established: 2,
        connections_terminated_by_timeout: 0,
        peakConnections: 2,
        totalDisconnected: 1,
      });
    });

    it('increments connections_terminated_by_timeout on heartbeat termination', () => {
      jest.useFakeTimers();

      pool.addConnection(createMockWs(), createMockReq());
      pool.addConnection(createMockWs(), createMockReq());

      // First interval: pings sent
      jest.advanceTimersByTime(1100);
      // Second interval: both silent — both terminated
      jest.advanceTimersByTime(1100);

      expect(pool.getMetrics().connections_terminated_by_timeout).toBe(2);
      expect(pool.getMetrics().active_connections).toBe(0);
    });

    it('emits metrics event on connection changes', () => {
      // Verify getMetrics() reflects live state
      pool.addConnection(createMockWs(), createMockReq());
      expect(pool.getMetrics().active_connections).toBe(1);
    });
  });

  describe('graceful shutdown', () => {
    it('clears the heartbeat interval on stopHeartbeat', () => {
      const ws = createMockWs();
      pool.addConnection(ws, createMockReq());
      expect(pool.heartbeatInterval).not.toBeNull();

      pool.stopHeartbeat();
      expect(pool.heartbeatInterval).toBeNull();
    });
  });
});
