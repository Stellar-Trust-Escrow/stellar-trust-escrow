/**
 * Tests for the comprehensive health check routes.
 *
 * External dependencies (Prisma, cache, Stellar, email) are mocked so the
 * tests stay fast and hermetic.
 */
import { jest, describe, expect, it, beforeEach } from '@jest/globals';

// ── Mock functions ────────────────────────────────────────────────────────────

const mockQueryRaw = jest.fn();
const mockAnalytics = jest.fn();
const mockGetMetrics = jest.fn();
const mockGetQueueSnapshot = jest.fn();
const mockGetLatestLedger = jest.fn();

// ── Module mocks (must come before any dynamic import of the SUT) ─────────────

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: { $queryRaw: (...args) => mockQueryRaw(...args) },
}));

jest.unstable_mockModule('../lib/cache.js', () => ({
  default: { analytics: () => mockAnalytics() },
}));

jest.unstable_mockModule('../api/websocket/handlers.js', () => ({
  pool: { getMetrics: () => mockGetMetrics() },
  createWebSocketServer: jest.fn(),
}));

jest.unstable_mockModule('../services/emailService.js', () => ({
  getQueueSnapshot: () => mockGetQueueSnapshot(),
  default: {},
}));

jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  SorobanRpc: {
    Server: jest.fn().mockImplementation(() => ({
      getLatestLedger: mockGetLatestLedger,
    })),
  },
}));

// ── Import the module under test after mocks are registered ──────────────────

const { default: healthRoutes } = await import('../api/routes/healthRoutes.js');
const { default: express } = await import('express');
const { default: request } = await import('supertest');

// ── Test app ──────────────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use('/health', healthRoutes);
  return app;
}

// ── Default mock values ───────────────────────────────────────────────────────

beforeEach(() => {
  mockQueryRaw.mockResolvedValue([{ connection_count: '5', current_time: new Date() }]);
  mockAnalytics.mockReturnValue({
    hits: 10,
    misses: 2,
    sets: 5,
    invalidations: 1,
    hitRate: '0.8333',
    backend: 'memory',
    memSize: 42,
  });
  mockGetMetrics.mockReturnValue({
    activeConnections: 3,
    peakConnections: 10,
    totalConnected: 50,
    totalDisconnected: 47,
    subscriptionsByTopic: { escrow: 3 },
  });
  mockGetQueueSnapshot.mockResolvedValue({ queue: [], deliveries: [] });
  mockGetLatestLedger.mockResolvedValue({ sequence: 55432100 });
});

// ── GET /health ───────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 and status=ok when all components are healthy', async () => {
    const res = await request(buildApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('includes all five component keys', async () => {
    const res = await request(buildApp()).get('/health');
    const keys = Object.keys(res.body.components);
    expect(keys).toEqual(expect.arrayContaining(['db', 'cache', 'stellar', 'email', 'websocket']));
  });

  it('includes top-level timestamp, uptime, and version', async () => {
    const res = await request(buildApp()).get('/health');
    expect(res.body.timestamp).toBeDefined();
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.version).toBeDefined();
  });

  it('returns 503 and status=error when the database is down', async () => {
    mockQueryRaw.mockRejectedValue(new Error('Connection refused'));
    const res = await request(buildApp()).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.components.db.status).toBe('error');
    expect(res.body.components.db.error).toBeDefined();
  });

  it('returns 200 and status=degraded when cache is degraded (Redis configured but down)', async () => {
    const origRedisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = 'redis://localhost:6379';
    mockAnalytics.mockReturnValue({ backend: 'memory', hits: 0, misses: 0, hitRate: '0', memSize: 0 });

    const res = await request(buildApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.components.cache.status).toBe('degraded');

    if (origRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = origRedisUrl;
  });

  it('db component includes latencyMs', async () => {
    const res = await request(buildApp()).get('/health');
    expect(typeof res.body.components.db.latencyMs).toBe('number');
  });

  it('stellar component reports ledger sequence on success', async () => {
    const res = await request(buildApp()).get('/health');
    expect(res.body.components.stellar.status).toBe('ok');
    expect(res.body.components.stellar.ledger).toBe(55432100);
  });

  it('stellar component reports error on network failure', async () => {
    mockGetLatestLedger.mockRejectedValue(new Error('Network error'));
    const res = await request(buildApp()).get('/health');
    expect(res.body.components.stellar.status).toBe('error');
    expect(res.body.components.stellar.error).toBe('Network error');
  });

  it('email component includes queue stats', async () => {
    mockGetQueueSnapshot.mockResolvedValue({
      queue: [{ status: 'queued' }, { status: 'queued' }, { status: 'failed' }],
      deliveries: [],
    });
    const res = await request(buildApp()).get('/health');
    expect(res.body.components.email.queueLength).toBe(3);
    expect(res.body.components.email.pending).toBe(2);
    expect(res.body.components.email.failed).toBe(1);
  });

  it('email is degraded when failure count exceeds threshold', async () => {
    const failedJobs = Array.from({ length: 11 }, () => ({ status: 'failed' }));
    mockGetQueueSnapshot.mockResolvedValue({ queue: failedJobs, deliveries: [] });
    const res = await request(buildApp()).get('/health');
    expect(res.body.components.email.status).toBe('degraded');
  });

  it('websocket component includes connection metrics', async () => {
    const res = await request(buildApp()).get('/health');
    const ws = res.body.components.websocket;
    expect(ws.status).toBe('ok');
    expect(ws.activeConnections).toBe(3);
    expect(ws.peakConnections).toBe(10);
  });
});

// ── GET /health/live ──────────────────────────────────────────────────────────

describe('GET /health/live', () => {
  it('always returns 200 regardless of db state', async () => {
    mockQueryRaw.mockRejectedValue(new Error('DB down'));
    const res = await request(buildApp()).get('/health/live');
    expect(res.status).toBe(200);
  });

  it('returns status=ok with timestamp and uptime', async () => {
    const res = await request(buildApp()).get('/health/live');
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
    expect(typeof res.body.uptime).toBe('number');
  });
});

// ── GET /health/ready ─────────────────────────────────────────────────────────

describe('GET /health/ready', () => {
  it('returns 200 when db and cache are healthy', async () => {
    const res = await request(buildApp()).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('returns 503 when db is down', async () => {
    mockQueryRaw.mockRejectedValue(new Error('DB unavailable'));
    const res = await request(buildApp()).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
  });

  it('only exposes db and cache components', async () => {
    const res = await request(buildApp()).get('/health/ready');
    const keys = Object.keys(res.body.components);
    expect(keys).toEqual(expect.arrayContaining(['db', 'cache']));
    expect(res.body.components.stellar).toBeUndefined();
    expect(res.body.components.email).toBeUndefined();
  });
});
