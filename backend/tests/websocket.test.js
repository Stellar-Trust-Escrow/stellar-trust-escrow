// Set up env vars for tests
process.env.WS_MAX_CONNECTIONS = '2';
process.env.WS_HEARTBEAT_INTERVAL_MS = '1000';

const { pool } = await import('../api/websocket/handlers.js');

describe('WebSocket Pool', () => {
  beforeEach(() => {
    // Clear pool before each test
    pool.connections.clear();
    pool.peakConnections = 0;
    pool.totalConnected = 0;
    pool.totalDisconnected = 0;
    pool.stopHeartbeat();
  });

  afterEach(() => {
    pool.stopHeartbeat();
  });

  const createMockWs = () => {
    const ws = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      terminate: jest.fn(),
      ping: jest.fn(),
      readyState: 1, // OPEN
    };
    return ws;
  };

  const createMockReq = () => ({
    socket: { remoteAddress: '127.0.0.1' },
  });

  describe('addConnection & removeConnection', () => {
    it('successfully adds a connection and returns a UUID', () => {
      const ws = createMockWs();
      const id = pool.addConnection(ws, createMockReq());

      expect(typeof id).toBe('string');
      expect(pool.connections.size).toBe(1);

      const conn = pool.connections.get(id);
      expect(conn).toBeDefined();
      expect(conn.isAlive).toBe(true);
      expect(conn.ip).toBe('127.0.0.1');

      // Ensure event listeners were attached
      expect(ws.on).toHaveBeenCalledWith('pong', expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(ws.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('rejects connection if MAX_CONNECTIONS is reached', () => {
      // Limit is 2 in env mock
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      const ws3 = createMockWs();

      pool.addConnection(ws1, createMockReq());
      pool.addConnection(ws2, createMockReq());

      const id3 = pool.addConnection(ws3, createMockReq());

      expect(id3).toBeNull();
      expect(pool.connections.size).toBe(2);
      expect(ws3.close).toHaveBeenCalledWith(1013, expect.any(String));
    });

    it('cleans up when removeConnection is called', () => {
      const ws = createMockWs();
      const id = pool.addConnection(ws, createMockReq());

      expect(pool.connections.size).toBe(1);

      pool.removeConnection(id);

      expect(pool.connections.size).toBe(0);
      expect(pool.totalDisconnected).toBe(1);
    });
  });

  describe('pub/sub & broadcast', () => {
    it('allows subscribing and unsubscribing from topics', () => {
      const ws = createMockWs();
      const id = pool.addConnection(ws, createMockReq());

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
    it('terminates connection if pong is not received', () => {
      jest.useFakeTimers();

      const ws = createMockWs();
      const id = pool.addConnection(ws, createMockReq());

      // Fast forward past first interval - ping is sent, isAlive set to false
      jest.advanceTimersByTime(1100);
      expect(ws.ping).toHaveBeenCalled();
      expect(pool.connections.get(id).isAlive).toBe(false);

      // Fast forward past second interval - no pong was received, so it terminates
      jest.advanceTimersByTime(1100);
      expect(ws.terminate).toHaveBeenCalled();
      expect(pool.connections.size).toBe(0);

      jest.useRealTimers();
    });

    it('keeps connection alive if pong is received', () => {
      jest.useFakeTimers();

      const ws = createMockWs();
      const id = pool.addConnection(ws, createMockReq());

      // Extract the 'pong' event handler
      const onPong = ws.on.mock.calls.find((call) => call[0] === 'pong')[1];

      // Fast forward past first interval - ping is sent
      jest.advanceTimersByTime(1100);
      expect(ws.ping).toHaveBeenCalled();
      expect(pool.connections.get(id).isAlive).toBe(false); // set to false by heartbeat

      // Simulate client pong
      onPong();
      expect(pool.connections.get(id).isAlive).toBe(true); // restored back to true

      // Fast forward past second interval - connection should still be alive
      jest.advanceTimersByTime(1100);
      expect(ws.terminate).not.toHaveBeenCalled();
      expect(pool.connections.size).toBe(1);

      jest.useRealTimers();
    });
  });

  describe('metrics', () => {
    it('returns correct metrics payload', () => {
      const ws1 = createMockWs();
      const id1 = pool.addConnection(ws1, createMockReq());

      const ws2 = createMockWs();
      pool.addConnection(ws2, createMockReq());

      pool.subscribe(id1, 'testTopic');
      pool.removeConnection(id1);

      const metrics = pool.getMetrics();

      expect(metrics).toMatchObject({
        activeConnections: 1,
        peakConnections: 2,
        totalConnected: 2,
        totalDisconnected: 1,
        subscriptionsByTopic: {},
      });
    });
  });
});
