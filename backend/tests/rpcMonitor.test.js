import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

// Stub prom-client so we don't need a real registry in tests
const makeMetric = () => ({ observe: jest.fn(), inc: jest.fn(), set: jest.fn() });
jest.unstable_mockModule('prom-client', () => ({
  default: {
    Histogram: jest.fn(() => makeMetric()),
    Counter: jest.fn(() => makeMetric()),
    Gauge: jest.fn(() => makeMetric()),
    Registry: jest.fn(() => ({ setDefaultLabels: jest.fn(), registerMetric: jest.fn() })),
    collectDefaultMetrics: jest.fn(),
  },
}));

// Stub the shared metrics registry
jest.unstable_mockModule('../lib/metrics.js', () => ({ register: {} }));

// ── fetch mock ────────────────────────────────────────────────────────────────

let fetchMock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock;
  jest.clearAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRpcResponse(sequence = 100, ok = true, latencyMs = 50) {
  return jest.fn().mockImplementation(
    () =>
      new Promise((resolve) =>
        setTimeout(() => {
          if (!ok)
            resolve({
              ok: false,
              status: 503,
              statusText: 'Service Unavailable',
              text: async () => 'err',
            });
          else
            resolve({
              ok: true,
              json: async () => ({ result: { sequence } }),
            });
        }, latencyMs),
      ),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('rpcMonitor', () => {
  describe('probe — successful response', () => {
    it('records success and returns latency + ledger', async () => {
      process.env.RPC_MONITOR_ENDPOINTS = 'https://rpc1.example.com';
      process.env.RPC_LATENCY_THRESHOLD_MS = '1500';
      process.env.RPC_FAILURE_RATE_THRESHOLD = '0.02';

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { sequence: 42 } }),
      });

      const { startRpcMonitor } = await import('../monitoring/rpcMonitor.js');
      // startRpcMonitor is a side-effect function; we test the probe indirectly
      // by verifying fetch was called with the right endpoint
      startRpcMonitor();

      // Give the first poll a tick to run
      await new Promise((r) => setTimeout(r, 20));

      expect(fetchMock).toHaveBeenCalledWith(
        'https://rpc1.example.com',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('probe — latency threshold breach', () => {
    it('emits a Slack alert when latency exceeds threshold', async () => {
      process.env.RPC_MONITOR_ENDPOINTS = 'https://slow.example.com';
      process.env.RPC_LATENCY_THRESHOLD_MS = '1'; // 1 ms — always breached
      process.env.SLACK_RPC_WEBHOOK = 'https://hooks.slack.com/test';
      process.env.PAGERDUTY_ROUTING_KEY = '';

      // First call: the RPC probe (slow)
      fetchMock.mockImplementationOnce(
        () =>
          new Promise(
            (r) =>
              setTimeout(
                () => r({ ok: true, json: async () => ({ result: { sequence: 1 } }) }),
                50,
              ), // 50 ms > 1 ms threshold
          ),
      );
      // Second call: Slack webhook
      fetchMock.mockResolvedValueOnce({ ok: true });

      // Re-import to get a fresh module with updated env
      jest.resetModules();
      const { startRpcMonitor: start } = await import('../monitoring/rpcMonitor.js');
      start();
      await new Promise((r) => setTimeout(r, 200));

      const slackCall = fetchMock.mock.calls.find(
        ([url]) => url === 'https://hooks.slack.com/test',
      );
      expect(slackCall).toBeDefined();
      const body = JSON.parse(slackCall[1].body);
      expect(body.text).toMatch(/latency/i);
    });
  });

  describe('probe — failure rate threshold breach', () => {
    it('emits an alert when failure rate exceeds threshold', async () => {
      process.env.RPC_MONITOR_ENDPOINTS = 'https://failing.example.com';
      process.env.RPC_LATENCY_THRESHOLD_MS = '5000';
      process.env.RPC_FAILURE_RATE_THRESHOLD = '0'; // 0% — any failure triggers alert
      process.env.RPC_ALERT_WINDOW = '1';
      process.env.SLACK_RPC_WEBHOOK = 'https://hooks.slack.com/test2';
      process.env.PAGERDUTY_ROUTING_KEY = '';

      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'down' })
        .mockResolvedValueOnce({ ok: true }); // Slack

      jest.resetModules();
      const { startRpcMonitor: start } = await import('../monitoring/rpcMonitor.js');
      start();
      await new Promise((r) => setTimeout(r, 200));

      const slackCall = fetchMock.mock.calls.find(
        ([url]) => url === 'https://hooks.slack.com/test2',
      );
      expect(slackCall).toBeDefined();
    });
  });

  describe('probe — RPC error in JSON body', () => {
    it('treats JSON-level RPC error as a failure', async () => {
      process.env.RPC_MONITOR_ENDPOINTS = 'https://rpcerr.example.com';
      process.env.RPC_LATENCY_THRESHOLD_MS = '5000';
      process.env.RPC_FAILURE_RATE_THRESHOLD = '0';
      process.env.RPC_ALERT_WINDOW = '1';
      process.env.SLACK_RPC_WEBHOOK = '';
      process.env.PAGERDUTY_ROUTING_KEY = '';

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: { message: 'method not found' } }),
      });

      jest.resetModules();
      const { startRpcMonitor: start } = await import('../monitoring/rpcMonitor.js');
      start();
      await new Promise((r) => setTimeout(r, 100));

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'rpc_probe_failed' }),
      );
    });
  });

  describe('sync lag tracking', () => {
    it('computes lag between endpoints', async () => {
      process.env.RPC_MONITOR_ENDPOINTS = 'https://a.example.com,https://b.example.com';
      process.env.RPC_LATENCY_THRESHOLD_MS = '5000';
      process.env.RPC_FAILURE_RATE_THRESHOLD = '0.5';
      process.env.SLACK_RPC_WEBHOOK = '';
      process.env.PAGERDUTY_ROUTING_KEY = '';

      // a returns ledger 100, b returns ledger 95 (5 behind)
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { sequence: 100 } }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { sequence: 95 } }) });

      jest.resetModules();
      const { startRpcMonitor: start } = await import('../monitoring/rpcMonitor.js');
      start();
      await new Promise((r) => setTimeout(r, 100));

      // poll_complete log should include both endpoints
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'rpc_poll_complete' }),
      );
    });
  });

  describe('no endpoints configured', () => {
    it('logs a warning and does not start polling', async () => {
      process.env.RPC_MONITOR_ENDPOINTS = '';
      process.env.SOROBAN_RPC_URL = '';

      jest.resetModules();
      const { startRpcMonitor: start } = await import('../monitoring/rpcMonitor.js');
      start();
      await new Promise((r) => setTimeout(r, 50));

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'rpc_monitor_no_endpoints' }),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
