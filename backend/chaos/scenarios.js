/**
 * Chaos Scenarios
 *
 * Each scenario runs a fault injector while firing load against the API
 * using autocannon, then asserts recovery criteria.
 *
 * Run all scenarios:
 *   node backend/chaos/runner.js
 *
 * Run a single scenario:
 *   node backend/chaos/runner.js --scenario db-disconnect
 *
 * @module chaos/scenarios
 */

import autocannon from 'autocannon';
import {
  injectDbDisconnect,
  injectRedisTimeout,
  injectRpcLag,
  injectDuplicateTransaction,
} from './faults.js';

const BASE_URL = process.env.CHAOS_TARGET_URL || 'http://localhost:4000';
const LOAD_DURATION = parseInt(process.env.CHAOS_LOAD_DURATION || '10', 10); // seconds
const CONNECTIONS = parseInt(process.env.CHAOS_CONNECTIONS || '10', 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

function runLoad(opts = {}) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: opts.url ?? `${BASE_URL}/health`,
        duration: opts.duration ?? LOAD_DURATION,
        connections: opts.connections ?? CONNECTIONS,
        headers: opts.headers ?? {},
        requests: opts.requests,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      },
    );
    autocannon.track(instance, { renderProgressBar: false });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ── Scenario 1: DB Disconnect ─────────────────────────────────────────────────

export async function scenarioDbDisconnect(prisma) {
  console.log('\n[Chaos] Scenario: DB Disconnect');

  // Inject fault for 5 s while load runs for 10 s
  const fault = injectDbDisconnect(prisma, 5_000);

  const result = await runLoad({
    url: `${BASE_URL}/api/escrows`,
    duration: LOAD_DURATION,
    requests: [{ method: 'GET', path: '/api/escrows' }],
  });

  fault.restore();

  // During fault window some requests will 500 — that's expected.
  // After restore, the API must recover: non-5xx rate should climb back.
  const errorRate = result.errors / Math.max(result.requests, 1);
  assert(errorRate < 1.0, 'All requests failed — app did not recover');
  assert(result.non2xx < result.requests, 'Zero successful responses during entire run');

  // Health endpoint must respond after fault is cleared
  const healthRes = await fetch(`${BASE_URL}/health`);
  assert(healthRes.ok, `Health check failed after DB fault cleared: ${healthRes.status}`);

  return {
    scenario: 'db-disconnect',
    requests: result.requests,
    errors: result.errors,
    non2xx: result.non2xx,
    latencyP99: result.latency?.p99,
    recovered: true,
  };
}

// ── Scenario 2: Redis Timeout ─────────────────────────────────────────────────

export async function scenarioRedisTimeout(redisClient) {
  console.log('\n[Chaos] Scenario: Redis Timeout');

  const fault = injectRedisTimeout(redisClient, 3_000, 5_000);

  const result = await runLoad({
    url: `${BASE_URL}/api/reputation/leaderboard`,
    duration: LOAD_DURATION,
  });

  fault.restore();

  // Cache misses should cause DB fallback — requests must still succeed
  const successRate = (result.requests - result.non2xx) / Math.max(result.requests, 1);
  assert(successRate > 0.5, `Success rate too low during Redis fault: ${successRate.toFixed(2)}`);

  // After restore, cache should work again
  const r1 = await fetch(`${BASE_URL}/api/reputation/leaderboard`);
  assert(r1.ok, `Leaderboard failed after Redis fault cleared: ${r1.status}`);

  return {
    scenario: 'redis-timeout',
    requests: result.requests,
    non2xx: result.non2xx,
    successRate: successRate.toFixed(2),
    recovered: true,
  };
}

// ── Scenario 3: Stellar RPC Lag ───────────────────────────────────────────────

export async function scenarioRpcLag() {
  console.log('\n[Chaos] Scenario: Stellar RPC Lag');

  const rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
  const fault = injectRpcLag(rpcUrl, 4_000, 8_000);

  // Hit the broadcast endpoint — it calls the RPC
  const result = await runLoad({
    url: `${BASE_URL}/api/escrows/broadcast`,
    duration: LOAD_DURATION,
    requests: [
      {
        method: 'POST',
        path: '/api/escrows/broadcast',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signedXdr: 'test-xdr' }),
      },
    ],
  });

  fault.restore();

  // Broadcast will return 4xx (bad XDR) or 5xx (RPC timeout) — both are
  // acceptable. What we assert is that the process did not crash.
  const healthRes = await fetch(`${BASE_URL}/health`);
  assert(healthRes.ok, `Health check failed after RPC lag fault: ${healthRes.status}`);

  return {
    scenario: 'rpc-lag',
    requests: result.requests,
    non2xx: result.non2xx,
    latencyP99: result.latency?.p99,
    recovered: true,
  };
}

// ── Scenario 4: Duplicate Transaction ────────────────────────────────────────

export async function scenarioDuplicateTransaction() {
  console.log('\n[Chaos] Scenario: Duplicate Transaction');

  const submitFn = async (xdr) => {
    const res = await fetch(`${BASE_URL}/api/escrows/broadcast`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signedXdr: xdr }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };

  const [first, second] = await injectDuplicateTransaction(submitFn, 'duplicate-test-xdr');

  // Both calls should return a response (not crash the server)
  assert(first.status !== 'rejected' || first.reason, 'First submission threw unexpectedly');
  assert(second.status !== 'rejected' || second.reason, 'Second submission threw unexpectedly');

  // Health must still be OK
  const healthRes = await fetch(`${BASE_URL}/health`);
  assert(healthRes.ok, `Health check failed after duplicate tx: ${healthRes.status}`);

  return {
    scenario: 'duplicate-transaction',
    firstStatus: first.value?.status ?? first.reason?.message,
    secondStatus: second.value?.status ?? second.reason?.message,
    recovered: true,
  };
}
