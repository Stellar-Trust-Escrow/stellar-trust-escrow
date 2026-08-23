/**
 * Single-user k6 smoke test for the blue-green deploy pipeline.
 *
 * Deliberately not load/perf testing (see tests/load/k6/ for that) — this
 * is a single virtual user hitting each critical endpoint once and failing
 * fast, so the pipeline's smoke-test gate has a clear pass/fail signal
 * within seconds.
 *
 * Usage: BASE_URL=https://green.example.com k6 run tests/smoke/smoke.k6.js
 */
import http from 'k6/http';
import { check, fail } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const TEST_EMAIL = __ENV.SMOKE_TEST_EMAIL || 'client@example.com';
const TEST_PASSWORD = __ENV.SMOKE_TEST_PASSWORD || 'password123';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    // Any failed check fails the whole run (non-zero exit), which is what
    // the deploy workflow's smoke-test step gates on.
    checks: ['rate==1'],
  },
};

export default function () {
  // 1. GET /healthz returns 200
  const health = http.get(`${BASE_URL}/healthz`);
  if (!check(health, { 'healthz is 200': (r) => r.status === 200 })) {
    fail('healthz check failed');
  }

  // 2. POST /api/v1/auth/login succeeds
  const login = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: 'smoke_login' } },
  );
  const loginOk = check(login, {
    'login is 200': (r) => r.status === 200,
    'login returns a token': (r) => Boolean(JSON.parse(r.body || '{}').token),
  });
  if (!loginOk) fail('login smoke check failed');
  const token = JSON.parse(login.body).token;

  // 3. GET /api/v1/escrows returns 200 with the expected schema
  const escrows = http.get(`${BASE_URL}/api/v1/escrows`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { endpoint: 'smoke_escrows' },
  });
  const escrowsOk = check(escrows, {
    'escrows list is 200': (r) => r.status === 200,
    'escrows list has data array': (r) => Array.isArray(JSON.parse(r.body || '{}').data),
  });
  if (!escrowsOk) fail('escrows list smoke check failed');

  // 4. Soroban RPC connectivity check
  const contractStatus = http.get(`${BASE_URL}/api/v1/contracts/status`, {
    tags: { endpoint: 'smoke_contracts_status' },
  });
  const rpcOk = check(contractStatus, {
    'contracts status is 200': (r) => r.status === 200,
    'soroban rpc connected': (r) => JSON.parse(r.body || '{}').connected === true,
  });
  if (!rpcOk) fail('Soroban RPC connectivity smoke check failed');
}
