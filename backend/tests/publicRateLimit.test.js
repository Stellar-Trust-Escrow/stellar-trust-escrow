/**
 * Tests for middleware/publicRateLimit.js
 *
 * All tests use the in-memory fallback (no Redis required).
 * Redis path is tested via the exported `increment` internals.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Force in-memory fallback by ensuring REDIS_URL is unset
delete process.env.REDIS_URL;

// Re-import after env manipulation — Jest module cache means we need dynamic import
const { publicRateLimit, _resetMemStore } = await import('../middleware/publicRateLimit.js');

function buildApp(ip = '1.2.3.4') {
  const app = express();
  app.use(express.json());
  // Inject a test IP via header; middleware reads X-Test-IP in test mode
  app.use((req, _res, next) => { req.headers['x-test-ip'] = ip; next(); });
  app.use(publicRateLimit);
  app.get('/api/escrows', (_req, res) => res.json({ ok: true }));
  app.get('/api/reputation/:address', (_req, res) => res.json({ ok: true }));
  return app;
}

beforeEach(() => {
  _resetMemStore();
});

describe('publicRateLimit — IP limiting', () => {
  it('allows requests under the IP limit', async () => {
    process.env.PUBLIC_RATE_LIMIT_IP_MAX = '5';
    const app = buildApp('10.0.0.1');
    const res = await request(app).get('/api/escrows');
    expect(res.status).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('returns 429 with Retry-After when IP limit exceeded', async () => {
    process.env.PUBLIC_RATE_LIMIT_IP_MAX = '2';
    const app = buildApp('10.0.0.2');

    await request(app).get('/api/escrows');
    await request(app).get('/api/escrows');
    const res = await request(app).get('/api/escrows');

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('tracks different IPs independently', async () => {
    process.env.PUBLIC_RATE_LIMIT_IP_MAX = '1';
    const appA = buildApp('10.0.1.1');
    const appB = buildApp('10.0.1.2');

    await request(appA).get('/api/escrows').expect(200);
    await request(appA).get('/api/escrows').expect(429);
    // Different IP should still be allowed
    await request(appB).get('/api/escrows').expect(200);
  });
});

describe('publicRateLimit — wallet limiting', () => {
  // Valid 56-char Stellar public key
  const WALLET = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

  it('applies wallet limit when address is in query param', async () => {
    process.env.PUBLIC_RATE_LIMIT_WALLET_MAX = '2';
    process.env.PUBLIC_RATE_LIMIT_IP_MAX = '100';
    const app = buildApp('10.0.2.1');

    await request(app).get(`/api/reputation/${WALLET}`).expect(200);
    await request(app).get(`/api/reputation/${WALLET}`).expect(200);
    const res = await request(app).get(`/api/reputation/${WALLET}`);
    expect(res.status).toBe(429);
  });

  it('applies wallet limit from x-wallet-address header', async () => {
    process.env.PUBLIC_RATE_LIMIT_WALLET_MAX = '1';
    process.env.PUBLIC_RATE_LIMIT_IP_MAX = '100';
    const app = buildApp('10.0.2.2');

    await request(app).get('/api/escrows').set('x-wallet-address', WALLET).expect(200);
    const res = await request(app)
      .get('/api/escrows')
      .set('x-wallet-address', WALLET);
    expect(res.status).toBe(429);
  });

  it('does not apply wallet limit when no address present', async () => {
    process.env.PUBLIC_RATE_LIMIT_WALLET_MAX = '1';
    process.env.PUBLIC_RATE_LIMIT_IP_MAX = '100';
    const app = buildApp('10.0.2.3');

    // Two requests with no wallet address — only IP limit applies (100)
    await request(app).get('/api/escrows').expect(200);
    await request(app).get('/api/escrows').expect(200);
  });
});

describe('publicRateLimit — whitelist', () => {
  it('bypasses limits for localhost (127.0.0.1)', async () => {
    process.env.PUBLIC_RATE_LIMIT_IP_MAX = '1';
    const app = buildApp('127.0.0.1');

    // Should never be rate limited regardless of request count
    for (let i = 0; i < 5; i++) {
      await request(app).get('/api/escrows').expect(200);
    }
  });

  it('bypasses limits for ::1 (IPv6 localhost)', async () => {
    process.env.PUBLIC_RATE_LIMIT_IP_MAX = '1';
    const app = buildApp('::1');

    await request(app).get('/api/escrows').expect(200);
    await request(app).get('/api/escrows').expect(200);
  });

  it('bypasses limits for IPs in RATE_LIMIT_WHITELIST_IPS', async () => {
    process.env.PUBLIC_RATE_LIMIT_IP_MAX = '1';
    process.env.RATE_LIMIT_WHITELIST_IPS = '192.168.1.100';
    const app = buildApp('192.168.1.100');

    await request(app).get('/api/escrows').expect(200);
    await request(app).get('/api/escrows').expect(200);
  });
});

describe('publicRateLimit — response headers', () => {
  it('includes X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset', async () => {
    process.env.PUBLIC_RATE_LIMIT_IP_MAX = '100';
    const app = buildApp('10.0.3.1'); // non-whitelisted IP
    const res = await request(app).get('/api/escrows');

    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
    expect(Number(res.headers['x-ratelimit-remaining'])).toBeGreaterThanOrEqual(0);
  });
});
