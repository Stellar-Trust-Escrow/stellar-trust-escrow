// @ts-check
import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.SMOKE_TEST_EMAIL || 'client@example.com';
const TEST_PASSWORD = process.env.SMOKE_TEST_PASSWORD || 'password123';

let authToken;

test.describe.serial('blue-green smoke suite', () => {
  test('GET /healthz returns 200', async ({ request }) => {
    const res = await request.get('/healthz');
    expect(res.status()).toBe(200);
  });

  test('POST /api/v1/auth/login with a test user succeeds', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('token');
    authToken = body.token;
  });

  test('GET /api/v1/escrows returns 200 with the expected schema', async ({ request }) => {
    const res = await request.get('/api/v1/escrows', {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Standard paginated envelope used across this API (see lib/pagination.js)
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  test('GET /api/v1/contracts/status reports Soroban RPC connectivity', async ({ request }) => {
    const res = await request.get('/api/v1/contracts/status');
    const body = await res.json();
    expect(body).toHaveProperty('connected');
    expect(typeof body.connected).toBe('boolean');
    // A 503 here is a real signal (RPC unreachable) — the smoke gate should
    // fail on it, not just check the field exists.
    expect(res.status()).toBe(200);
    expect(body.connected).toBe(true);
  });
});
