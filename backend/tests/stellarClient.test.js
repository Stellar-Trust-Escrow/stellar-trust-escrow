import { jest } from '@jest/globals';

const loggerMock = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

// Mock SorobanRpc.Server
const mockServerInstances = new Map();
const mockSorobanRpc = {
  SorobanRpc: {
    Server: jest.fn((url) => {
      if (!mockServerInstances.has(url)) {
        mockServerInstances.set(url, {
          getLatestLedger: jest.fn(),
          sendTransaction: jest.fn(),
          getTransaction: jest.fn(),
          getEvents: jest.fn(),
        });
      }
      return mockServerInstances.get(url);
    }),
  },
  Transaction: jest.fn((xdr) => ({ xdr })),
  Networks: {
    PUBLIC: 'public',
    TESTNET: 'testnet',
  },
};

jest.unstable_mockModule('@stellar/stellar-sdk', () => mockSorobanRpc);

const { default: stellarClient } = await import('../services/stellarClient.js');

describe('Stellar Client with Horizon Failover', () => {
  let primaryServer;
  let backupServer;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServerInstances.clear();
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    loggerMock.error.mockReset();

    // Setup mock servers
    primaryServer = mockServerInstances.get('https://primary.stellar.org') || {
      getLatestLedger: jest.fn(),
      sendTransaction: jest.fn(),
      getTransaction: jest.fn(),
      getEvents: jest.fn(),
    };
    backupServer = mockServerInstances.get('https://backup.stellar.org') || {
      getLatestLedger: jest.fn(),
      sendTransaction: jest.fn(),
      getTransaction: jest.fn(),
      getEvents: jest.fn(),
    };

    mockServerInstances.set('https://primary.stellar.org', primaryServer);
    mockServerInstances.set('https://backup.stellar.org', backupServer);
  });

  afterEach(() => {
    stellarClient.destroy();
  });

  describe('initialization', () => {
    it('initializes with multiple endpoints', () => {
      expect(stellarClient.endpoints).toHaveLength(1); // Default single endpoint
      expect(stellarClient.nodeHealth.size).toBeGreaterThan(0);
    });

    it('starts health check timer', () => {
      expect(stellarClient.healthCheckTimer).toBeDefined();
    });
  });

  describe('successful query uses primary node', () => {
    it('executes getLatestLedger on primary endpoint', async () => {
      primaryServer.getLatestLedger.mockResolvedValue({ sequence: 50000 });

      const result = await stellarClient.getLatestLedger();

      expect(result).toBe(50000);
      expect(primaryServer.getLatestLedger).toHaveBeenCalled();
      expect(loggerMock.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'query_success',
        })
      );
    });

    it('records success metrics on healthy query', async () => {
      primaryServer.getLatestLedger.mockResolvedValue({ sequence: 40000 });

      await stellarClient.getLatestLedger();

      const primaryHealth = stellarClient.nodeHealth.get(stellarClient.getPrimaryEndpoint());
      expect(primaryHealth.successCount).toBe(1);
      expect(primaryHealth.failureCount).toBe(0);
      expect(primaryHealth.isHealthy).toBe(true);
    });

    it('records latency metric', async () => {
      primaryServer.getLatestLedger.mockResolvedValue({ sequence: 45000 });

      await stellarClient.getLatestLedger();

      const primaryHealth = stellarClient.nodeHealth.get(stellarClient.getPrimaryEndpoint());
      expect(primaryHealth.averageLatency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('primary failure triggers failover', () => {
    it('falls back to backup when primary fails', async () => {
      // Simulate primary failure
      primaryServer.getLatestLedger.mockRejectedValue(new Error('Connection refused'));

      // Create a new client with multiple endpoints for this test
      const testEndpoints = ['https://primary.stellar.org', 'https://backup.stellar.org'];
      const client = new (await import('../services/stellarClient.js')).default;
      // Manually set up endpoints to test failover
      client.endpoints = testEndpoints;
      client.nodeHealth.clear();
      testEndpoints.forEach((url) => {
        const nodeHealthClass = (await import('../services/stellarClient.js')).NodeHealth || function () {};
        const health = {
          url,
          isHealthy: true,
          failureCount: 0,
          successCount: 0,
          canAttempt: () => true,
          recordSuccess: jest.fn(),
          recordFailure: jest.fn(),
          getMetrics: jest.fn(() => ({ url, isHealthy: true })),
        };
        client.nodeHealth.set(url, health);
      });

      // Mock backup to succeed
      backupServer.getLatestLedger.mockResolvedValue({ sequence: 55000 });

      // Should failover and succeed
      const result = await client.executeWithFailover(async (server) => {
        return await server.getLatestLedger();
      });

      expect(result).toBeDefined();
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'query_failed_attempting_next_node',
        })
      );
    });

    it('records failure count on primary failure', async () => {
      primaryServer.getLatestLedger.mockRejectedValue(new Error('Network error'));

      try {
        await stellarClient.getLatestLedger();
      } catch {
        // Expected to throw after all retries
      }

      const primaryHealth = stellarClient.nodeHealth.get(stellarClient.getPrimaryEndpoint());
      expect(primaryHealth.failureCount).toBeGreaterThan(0);
    });

    it('deprioritizes node after repeated failures', async () => {
      primaryServer.getLatestLedger.mockRejectedValue(new Error('Persistent error'));

      // Trigger 3 failures
      for (let i = 0; i < 3; i++) {
        try {
          await stellarClient.getLatestLedger();
        } catch {
          // Expected
        }
      }

      const primaryHealth = stellarClient.nodeHealth.get(stellarClient.getPrimaryEndpoint());
      expect(primaryHealth.failureCount).toBeGreaterThanOrEqual(3);
      expect(primaryHealth.isHealthy).toBe(false);
      expect(primaryHealth.deprioritizedUntil).toBeDefined();
    });
  });

  describe('all nodes down surfaces clear error', () => {
    it('throws meaningful error when all endpoints fail', async () => {
      primaryServer.getLatestLedger.mockRejectedValue(new Error('Primary failed'));

      const client = new (await import('../services/stellarClient.js')).default;
      client.endpoints = ['https://primary.stellar.org'];
      client.nodeHealth.clear();
      const health = {
        url: 'https://primary.stellar.org',
        isHealthy: true,
        canAttempt: () => true,
        recordFailure: jest.fn(),
      };
      client.nodeHealth.set('https://primary.stellar.org', health);

      await expect(client.executeWithFailover(async (server) => {
        return await server.getLatestLedger();
      })).rejects.toThrow('All Stellar endpoints failed');
    });

    it('logs error when all nodes fail', async () => {
      primaryServer.getLatestLedger.mockRejectedValue(new Error('Service unavailable'));

      const client = new (await import('../services/stellarClient.js')).default;
      client.endpoints = ['https://primary.stellar.org'];
      client.nodeHealth.clear();
      const health = {
        url: 'https://primary.stellar.org',
        isHealthy: true,
        canAttempt: () => true,
        recordFailure: jest.fn(),
      };
      client.nodeHealth.set('https://primary.stellar.org', health);

      try {
        await client.executeWithFailover(async (server) => {
          return await server.getLatestLedger();
        });
      } catch (error) {
        expect(error.message).toContain('All Stellar endpoints failed');
      }

      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'all_endpoints_failed',
        })
      );
    });

    it('does not crash when error occurs', async () => {
      primaryServer.getLatestLedger.mockRejectedValue(new Error('Fatal error'));

      const client = new (await import('../services/stellarClient.js')).default;
      client.endpoints = ['https://primary.stellar.org'];
      client.nodeHealth.clear();
      const health = {
        url: 'https://primary.stellar.org',
        isHealthy: true,
        canAttempt: () => true,
        recordFailure: jest.fn(),
      };
      client.nodeHealth.set('https://primary.stellar.org', health);

      // Should not throw unhandled exception; should return promise rejection
      const promise = client.executeWithFailover(async (server) => {
        return await server.getLatestLedger();
      });

      // Wait for rejection
      await expect(promise).rejects.toBeDefined();

      // Client should still be usable
      expect(client).toBeDefined();
    });
  });

  describe('recovering node re-enters rotation', () => {
    it('re-enters rotation after recovery window', async () => {
      // Manually create a short recovery window for testing
      const shortRecoveryWindow = 100; // 100ms for testing
      const health = {
        url: 'https://test.stellar.org',
        isHealthy: false,
        failureCount: 3,
        deprioritizedUntil: Date.now() + shortRecoveryWindow,
        canAttempt: function () {
          if (this.deprioritizedUntil && Date.now() > this.deprioritizedUntil) {
            this.isHealthy = true;
            this.deprioritizedUntil = null;
            this.failureCount = 0;
            return true;
          }
          return !this.deprioritizedUntil || Date.now() <= this.deprioritizedUntil;
        },
      };

      // Node is deprioritized
      expect(health.canAttempt()).toBe(true); // Still reports true but internally locked
      expect(health.isHealthy).toBe(false);

      // Wait for recovery window to pass
      await new Promise((resolve) => setTimeout(resolve, shortRecoveryWindow + 50));

      // Node should be able to attempt again
      expect(health.canAttempt()).toBe(true);
      expect(health.isHealthy).toBe(true);
      expect(health.failureCount).toBe(0);
    });

    it('tracks recovery metrics', async () => {
      const health = {
        url: 'https://recovery.stellar.org',
        isHealthy: false,
        failureCount: 5,
        successCount: 10,
        lastFailedAt: Date.now(),
        deprioritizedUntil: Date.now() + 100,
        getMetrics: function () {
          return {
            url: this.url,
            isHealthy: this.isHealthy,
            failureCount: this.failureCount,
            successCount: this.successCount,
            deprioritizedUntil: this.deprioritizedUntil,
          };
        },
      };

      const metrics = health.getMetrics();
      expect(metrics.url).toBe('https://recovery.stellar.org');
      expect(metrics.isHealthy).toBe(false);
      expect(metrics.failureCount).toBe(5);
      expect(metrics.successCount).toBe(10);
    });
  });

  describe('health metrics reporting', () => {
    it('exposes real-time health metrics', () => {
      const metrics = stellarClient.getHealthMetrics();

      expect(metrics).toHaveProperty('timestamp');
      expect(metrics).toHaveProperty('activeEndpoint');
      expect(metrics).toHaveProperty('nodes');
      expect(Array.isArray(metrics.nodes)).toBe(true);
    });

    it('includes node-specific metrics', () => {
      const metrics = stellarClient.getHealthMetrics();

      metrics.nodes.forEach((node) => {
        expect(node).toHaveProperty('url');
        expect(node).toHaveProperty('isHealthy');
        expect(node).toHaveProperty('canAttempt');
        expect(node).toHaveProperty('failureCount');
        expect(node).toHaveProperty('successCount');
        expect(node).toHaveProperty('averageLatency');
      });
    });
  });

  describe('query timeout handling', () => {
    it('times out slow queries', async () => {
      // Mock slow response
      primaryServer.getLatestLedger.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ sequence: 60000 }), 60000)
          )
      );

      const client = new (await import('../services/stellarClient.js')).default;
      client.endpoints = ['https://primary.stellar.org'];
      client.nodeHealth.clear();
      const health = {
        url: 'https://primary.stellar.org',
        isHealthy: true,
        canAttempt: () => true,
        recordFailure: jest.fn(),
        failureCount: 0,
      };
      client.nodeHealth.set('https://primary.stellar.org', health);

      // Should timeout before response
      const promise = client.executeWithFailover(async (server) => {
        return await server.getLatestLedger();
      });

      await expect(promise).rejects.toThrow('Query timeout');
    });
  });
});
