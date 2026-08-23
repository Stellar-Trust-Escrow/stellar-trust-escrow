/**
 * Stellar RPC Client
 *
 * Thin, resilient wrapper around the Soroban RPC endpoint used by the escrow
 * indexer and the CQRS write model. Every public method is:
 *
 *  1. Wrapped in a circuit breaker (`lib/circuitBreaker`) so a sick Horizon /
 *     Soroban node fails fast instead of stalling the whole pipeline.
 *  2. Traced with an OpenTelemetry span (`lib/tracing`) for end-to-end
 *     observability.
 *
 * ## Behaviour notes
 *  - `submitTransaction` polls with exponential backoff (1s → 2s → 4s … capped
 *    at 8s, max 10 attempts) and resolves with a normalised outcome.
 *  - `getContractEvents` fans a large ledger range out into sequential
 *    4096-ledger batches; each batch retries up to 3× with a 500ms exponential
 *    base so a transient gap doesn't drop events.
 *  - When the circuit is OPEN every call rejects immediately with
 *    `{ code: 'STELLAR_RPC_UNAVAILABLE' }` — callers must not retry; they should
 *    surface the outage.
 *
 * @module services/stellarService
 */

import { SorobanRpc, Transaction, Networks } from '@stellar/stellar-sdk';
import { getBreaker, CircuitOpenError } from '../lib/circuitBreaker.js';
import { withSpan } from '../lib/tracing.js';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('service.stellarService');

/** RPC endpoint. Override with STELLAR_RPC_URL in non-test environments. */
export const STELLAR_RPC_URL = process.env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';

const NETWORK = process.env.STELLAR_NETWORK || 'testnet';
const NETWORK_PASSPHRASE = NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

// ─── Polling / backoff knobs (env-overridable for tests) ─────────────────────
const INITIAL_POLL_MS = parseInt(process.env.STELLAR_TX_INITIAL_POLL_MS || '1000', 10);
const POLL_CAP_MS = parseInt(process.env.STELLAR_TX_POLL_CAP_MS || '8000', 10);
const MAX_ATTEMPTS = parseInt(process.env.STELLAR_TX_MAX_ATTEMPTS || '10', 10);

// ─── Fan-out batching ─────────────────────────────────────────────────────────
const BATCH_SIZE = 4096;
const BATCH_MAX_RETRIES = 3;
const BATCH_BASE_DELAY_MS = 500;

// ─── Circuit breaker ──────────────────────────────────────────────────────────
// Shared breaker for all four RPC entry points. Opens after 5 failures within
// the sliding window; stays open for 30s before a single probe is allowed.
const breaker = getBreaker('stellar-rpc', {
  failureThreshold: 5,
  timeout: 30_000,
  successThreshold: 2,
});

// ─── Injectable sleep (so tests can assert the backoff schedule) ──────────────
let _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** Test hook: override the delay primitive. */
export function __setSleep(fn) {
  _sleep = fn;
}

// Lazily-created, reused RPC server handle.
let _server = null;
function _getServer() {
  if (!_server) {
    _server = new SorobanRpc.Server(STELLAR_RPC_URL, {
      allowHttp: STELLAR_RPC_URL.startsWith('http://'),
    });
  }
  return _server;
}

/**
 * Wrap an RPC operation in a span + the circuit breaker.
 * Converts a tripped breaker into the spec'd `STELLAR_RPC_UNAVAILABLE` error.
 */
async function guarded(spanName, operation) {
  // Note: withSpan is (spanName, attributes, fn). Passing an attributes object
  // keeps the call well-formed for the real OTel SDK *and* for the test mock.
  return withSpan(spanName, { module: 'stellarService' }, async (span) => {
    try {
      return await breaker.execute(operation);
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        const unavailable = new Error('Stellar RPC circuit is open');
        unavailable.code = 'STELLAR_RPC_UNAVAILABLE';
        unavailable.cause = err;
        span.recordException?.(unavailable);
        throw unavailable;
      }
      span.recordException?.(err);
      throw err;
    }
  });
}

// ─── Raw server calls (no breaker — the exported wrappers own that) ───────────

async function rpcGetLatestLedger() {
  const server = _getServer();
  const res = await server.getLatestLedger();
  return res.sequence;
}

async function rpcGetEvents(startLedger, endLedger, contractId) {
  const server = _getServer();
  const res = await server.getEvents({
    startLedger,
    // Bounds the query so each fan-out batch pulls exactly its 4096-ledger slice
    // rather than re-fetching the whole range from `startLedger` to the head.
    endLedger,
    filters: [{ type: 'contract', contractIds: [contractId] }],
  });
  return res?.events ?? [];
}

async function rpcSendTransaction(signedXdr) {
  const server = _getServer();
  const tx = new Transaction(signedXdr, NETWORK_PASSPHRASE);
  const send = await server.sendTransaction(tx);
  return { tx, send };
}

async function rpcGetTransaction(hash) {
  const server = _getServer();
  return server.getTransaction(hash);
}

async function rpcSimulate(xdr) {
  const server = _getServer();
  const tx = new Transaction(xdr, NETWORK_PASSPHRASE);
  return server.simulateTransaction(tx);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Submit a signed transaction and poll until it settles, times out, or errors.
 *
 * @param {string} signedXdr - base64-encoded signed transaction
 * @returns {Promise<{ hash: string, status: 'SUCCESS'|'FAILED'|'TIMEOUT', errorResultXdr?: string }>}
 */
export async function submitTransaction(signedXdr) {
  return guarded('stellarService.submitTransaction', async () => {
    const { tx, send } = await rpcSendTransaction(signedXdr);

    if (send.status === 'ERROR') {
      return {
        hash: send.hash,
        status: 'FAILED',
        errorResultXdr: send.errorResultXdr,
      };
    }

    const hash = send.hash;
    let delay = INITIAL_POLL_MS;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await _sleep(delay);
        delay = Math.min(delay * 2, POLL_CAP_MS);
      }

      const result = await rpcGetTransaction(hash);
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
 * Fetch contract events from `startLedger` up to the current ledger.
 * Large ranges are fanned out into sequential 4096-ledger batches, each
 * retried independently.
 *
 * @param {number} startLedger
 * @param {string} contractId
 * @returns {Promise<Array>} flattened list of events
 */
export async function getContractEvents(startLedger, contractId) {
  return guarded('stellarService.getContractEvents', async () => {
    const latestLedger = await rpcGetLatestLedger();
    const range = latestLedger - startLedger;
    if (range <= 0) return [];

    const batchCount = range > BATCH_SIZE ? Math.ceil(range / BATCH_SIZE) : 1;
    const all = [];

    for (let i = 0; i < batchCount; i++) {
      const batchStart = startLedger + i * BATCH_SIZE;
      const batchEnd = Math.min(startLedger + (i + 1) * BATCH_SIZE, latestLedger);
      const events = await fetchBatchWithRetry(batchStart, batchEnd, contractId);
      all.push(...events);
    }

    return all;
  });
}

/** Fetch one batch, retrying up to 3× with a 500ms exponential base. */
async function fetchBatchWithRetry(startLedger, endLedger, contractId) {
  let lastError;
  for (let attempt = 0; attempt < BATCH_MAX_RETRIES; attempt++) {
    try {
      return await rpcGetEvents(startLedger, endLedger, contractId);
    } catch (err) {
      lastError = err;
      log.warn({
        message: 'contract_events_batch_retry',
        attempt: attempt + 1,
        startLedger,
        error: err?.message,
      });
      if (attempt < BATCH_MAX_RETRIES - 1) {
        await _sleep(BATCH_BASE_DELAY_MS * 2 ** attempt);
      }
    }
  }
  throw lastError;
}

/**
 * Current ledger sequence number.
 * @returns {Promise<number>}
 */
export async function getLatestLedger() {
  return guarded('stellarService.getLatestLedger', rpcGetLatestLedger);
}

/**
 * Dry-run a transaction for fee estimation.
 *
 * @param {string} xdr - base64-encoded transaction
 * @returns {Promise<{ success: boolean, cost: { cpuInsns: string, memBytes: string } }>}
 */
export async function simulateTransaction(xdr) {
  return guarded('stellarService.simulateTransaction', async () => {
    const sim = await rpcSimulate(xdr);
    const ok = !sim.error;
    const first = sim.results?.[0] ?? {};
    return {
      success: ok,
      cost: {
        cpuInsns: ok ? String(first.cpuInsns ?? '0') : '0',
        memBytes: ok ? String(first.memBytes ?? '0') : '0',
      },
    };
  });
}

/**
 * Current circuit-breaker state, for health-check endpoints.
 * @returns {'CLOSED'|'OPEN'|'HALF_OPEN'}
 */
export function getStellarCircuitState() {
  return breaker.state;
}

const stellarService = {
  STELLAR_RPC_URL,
  submitTransaction,
  getContractEvents,
  getLatestLedger,
  simulateTransaction,
  getStellarCircuitState,
  __setSleep,
};

export { stellarService };
export default stellarService;
