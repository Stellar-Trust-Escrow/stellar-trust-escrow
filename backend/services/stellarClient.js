/**
 * Stellar Horizon Query Failover and Smart Routing Service
 *
 * Resilient Stellar client wrapping the Stellar SDK with:
 *  - Configurable list of Horizon endpoints (primary + backups)
 *  - Primary-first retry strategy on failure or timeout
 *  - Periodic health checks for node deprioritization
 *  - Automatic recovery window for failed nodes
 *  - Real-time health metrics for monitoring
 *
 * Architecture:
 *  - Attempts primary endpoint first on each query
 *  - On failure/timeout, catches error and retries next backup in round-robin
 *  - Periodically checks health of all nodes; failing nodes are temporarily deprioritized
 *  - Failed nodes re-enter rotation after a configurable recovery window
 *  - Logs latency, failure count, and active node for real-time monitoring
 */

import { SorobanRpc, Transaction, Networks } from '@stellar/stellar-sdk';
import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('service.stellarClient');

// Configuration from environment
const DEFAULT_HORIZON_ENDPOINT =
  process.env.NODE_ENV === 'test'
    ? 'https://primary.stellar.org'
    : 'https://soroban-testnet.stellar.org';
const HORIZON_ENDPOINTS = (process.env.HORIZON_ENDPOINTS || DEFAULT_HORIZON_ENDPOINT)
  .split(',')
  .map((url) => url.trim())
  .filter((url) => url);
const HEALTH_CHECK_INTERVAL = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '60000', 10);
const NODE_RECOVERY_WINDOW = parseInt(process.env.NODE_RECOVERY_WINDOW_MS || '300000', 10);
const QUERY_TIMEOUT = parseInt(
  process.env.QUERY_TIMEOUT_MS || (process.env.NODE_ENV === 'test' ? '250' : '30000'),
  10,
);
const NETWORK = process.env.STELLAR_NETWORK || 'testnet';
const NETWORK_PASSPHRASE = NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

/**
 * Node health tracker
 */
class NodeHealth {
  constructor(url) {
    this.url = url;
    this.isHealthy = true;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailedAt = null;
    this.averageLatency = 0;
    this.deprioritizedUntil = null;
  }

  recordSuccess(latency) {
    this.successCount += 1;
    this.failureCount = 0;
    this.lastFailedAt = null;
    this.isHealthy = true;
    this.deprioritizedUntil = null;
    this.updateAverageLatency(latency);
  }

  recordFailure() {
    this.failureCount += 1;
    this.lastFailedAt = Date.now();
    if (this.failureCount >= 3) {
      // Deprioritize after 3 consecutive failures
      this.isHealthy = false;
      this.deprioritizedUntil = Date.now() + NODE_RECOVERY_WINDOW;
    }
  }

  updateAverageLatency(latency) {
    // Exponential moving average: 70% old + 30% new
    this.averageLatency = this.averageLatency * 0.7 + latency * 0.3;
  }

  canAttempt() {
    if (!this.deprioritizedUntil) return true;
    if (Date.now() > this.deprioritizedUntil) {
      // Recovery window expired; try again
      this.isHealthy = true;
      this.deprioritizedUntil = null;
      this.failureCount = 0;
      return true;
    }
    return false;
  }

  getMetrics() {
    return {
      url: this.url,
      isHealthy: this.isHealthy,
      canAttempt: this.canAttempt(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      averageLatency: this.averageLatency.toFixed(2),
      deprioritizedUntil: this.deprioritizedUntil,
    };
  }
}

export class StellarClient {
  constructor(endpoints = HORIZON_ENDPOINTS) {
    this.endpoints = endpoints;
    this.nodeHealth = new Map(endpoints.map((url) => [url, new NodeHealth(url)]));
    this.primaryIndex = 0;
    this.healthCheckTimer = null;
    this.startHealthChecks();

    logger.info({
      message: 'stellar_client_initialized',
      endpoints: endpoints.length,
      urls: endpoints,
    });
  }

  /**
   * Get the current active primary endpoint.
   */
  getPrimaryEndpoint() {
    return this.endpoints[this.primaryIndex];
  }

  /**
   * Start periodic health checks for all nodes.
   */
  startHealthChecks() {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks().catch((error) => {
        logger.error({
          message: 'health_check_error',
          error: error.message,
        });
      });
    }, HEALTH_CHECK_INTERVAL);
    this.healthCheckTimer.unref?.();
  }

  /**
   * Perform health checks on all endpoints in parallel.
   */
  async performHealthChecks() {
    const checks = this.endpoints.map(async (url) => {
      const health = this.nodeHealth.get(url);
      try {
        const startTime = Date.now();
        const server = new SorobanRpc.Server(url, { allowHttp: url.startsWith('http://') });
        const result = await Promise.race([
          server.getLatestLedger(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Health check timeout')), QUERY_TIMEOUT),
          ),
        ]);
        const latency = Date.now() - startTime;
        health.recordSuccess(latency);
        return { url, status: 'healthy', latency };
      } catch (error) {
        health.recordFailure();
        return { url, status: 'unhealthy', error: error.message };
      }
    });

    const results = await Promise.all(checks);

    // Log health metrics
    logger.info({
      message: 'health_check_complete',
      timestamp: new Date().toISOString(),
      results: results.map((r) => ({
        url: r.url,
        status: r.status,
        latency: r.latency,
        error: r.error,
      })),
    });

    return results;
  }

  /**
   * Get ordered list of endpoints: primary + backups (available first, deprioritized last).
   */
  getEndpointOrder() {
    const primary = this.getPrimaryEndpoint();
    const available = this.endpoints.filter((url) => this.nodeHealth.get(url).canAttempt());
    const primaryFirst = [primary, ...available.filter((url) => url !== primary)];
    return [...new Set(primaryFirst)];
  }

  /**
   * Execute a query with automatic failover.
   */
  async executeWithFailover(queryFn) {
    const endpointOrder = this.getEndpointOrder();

    if (endpointOrder.length === 0) {
      throw new Error('No healthy Stellar endpoints available');
    }

    let lastError;
    for (const url of endpointOrder) {
      const health = this.nodeHealth.get(url);
      try {
        const startTime = Date.now();
        const server = new SorobanRpc.Server(url, { allowHttp: url.startsWith('http://') });

        // Execute query with timeout
        const result = await Promise.race([
          queryFn(server),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), QUERY_TIMEOUT),
          ),
        ]);

        const latency = Date.now() - startTime;
        health.recordSuccess(latency);

        logger.info({
          message: 'query_success',
          activeNode: url,
          latency,
          successCount: health.successCount,
        });

        return result;
      } catch (error) {
        lastError = error;
        health.recordFailure();

        logger.warn({
          message: 'query_failed_attempting_next_node',
          failedNode: url,
          error: error.message,
          failureCount: health.failureCount,
        });

        // Continue to next endpoint
      }
    }

    // All endpoints exhausted
    logger.error({
      message: 'all_endpoints_failed',
      error: lastError.message,
      attemptedCount: endpointOrder.length,
    });

    throw new Error(`All Stellar endpoints failed: ${lastError.message}`);
  }

  /**
   * Stellar SDK wrapper: submit a signed transaction.
   */
  async submitTransaction(signedXdr) {
    return this.executeWithFailover(async (server) => {
      const tx = new Transaction(signedXdr, NETWORK_PASSPHRASE);
      const sendResult = await server.sendTransaction(tx);

      if (sendResult.status === 'ERROR') {
        return {
          hash: sendResult.hash,
          status: 'FAILED',
          errorResultXdr: sendResult.errorResultXdr,
        };
      }

      // Poll until settled
      const hash = sendResult.hash;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const result = await server.getTransaction(hash);
        if (result.status !== 'NOT_FOUND') {
          return {
            hash,
            status: result.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
            errorResultXdr: result.resultXdr,
          };
        }
      }

      return { hash, status: 'TIMEOUT' };
    });
  }

  /**
   * Stellar SDK wrapper: get contract events.
   */
  async getContractEvents(startLedger, contractId) {
    return this.executeWithFailover(async (server) => {
      const response = await server.getEvents({
        startLedger,
        filters: [{ type: 'contract', contractIds: [contractId] }],
      });
      return response.events ?? [];
    });
  }

  /**
   * Stellar SDK wrapper: get latest ledger.
   */
  async getLatestLedger() {
    return this.executeWithFailover(async (server) => {
      const health = await server.getLatestLedger();
      return health.sequence;
    });
  }

  /**
   * Get current health metrics for all nodes.
   */
  getHealthMetrics() {
    return {
      timestamp: new Date().toISOString(),
      activeEndpoint: this.getPrimaryEndpoint(),
      nodes: Array.from(this.nodeHealth.values()).map((h) => h.getMetrics()),
    };
  }

  /**
   * Cleanup: stop health checks.
   */
  destroy() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }
}

export default new StellarClient(HORIZON_ENDPOINTS);
