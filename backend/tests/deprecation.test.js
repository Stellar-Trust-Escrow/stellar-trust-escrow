import { describe, expect, it, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

import {
  deprecate,
  deprecationDiscovery,
  getDeprecationRegistry,
  registerDeprecation,
} from '../api/middleware/deprecation.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildApp(middlewares = []) {
  const app = express();
  for (const mw of middlewares) app.use(mw);
  app.get('/resource', (_req, res) => res.json({ data: 'ok' }));
  return app;
}

const DEPRECATED_AT = new Date('2025-01-01T00:00:00.000Z');
const SUNSET_AT = new Date('2026-07-01T00:00:00.000Z');

// ── deprecate() middleware ────────────────────────────────────────────────────

describe('deprecate middleware', () => {
  it('sets the Deprecation header', async () => {
    const app = buildApp([deprecate({ deprecatedAt: DEPRECATED_AT })]);
    const res = await request(app).get('/resource');
    expect(res.headers['deprecation']).toBe(DEPRECATED_AT.toUTCString());
  });

  it('sets the Sunset header when sunsetAt is provided', async () => {
    const app = buildApp([deprecate({ deprecatedAt: DEPRECATED_AT, sunsetAt: SUNSET_AT })]);
    const res = await request(app).get('/resource');
    expect(res.headers['sunset']).toBe(SUNSET_AT.toUTCString());
  });

  it('omits Sunset header when sunsetAt is not provided', async () => {
    const app = buildApp([deprecate({ deprecatedAt: DEPRECATED_AT })]);
    const res = await request(app).get('/resource');
    expect(res.headers['sunset']).toBeUndefined();
  });

  it('sets the Link header with rel=deprecation when link is provided', async () => {
    const app = buildApp([
      deprecate({ deprecatedAt: DEPRECATED_AT, link: 'https://docs.example.com/migration' }),
    ]);
    const res = await request(app).get('/resource');
    expect(res.headers['link']).toContain('rel="deprecation"');
    expect(res.headers['link']).toContain('https://docs.example.com/migration');
  });

  it('omits Link header when link is not provided', async () => {
    const app = buildApp([deprecate({ deprecatedAt: DEPRECATED_AT })]);
    const res = await request(app).get('/resource');
    expect(res.headers['link']).toBeUndefined();
  });

  it('sets the Warning header', async () => {
    const app = buildApp([deprecate({ deprecatedAt: DEPRECATED_AT })]);
    const res = await request(app).get('/resource');
    expect(res.headers['warning']).toMatch(/^299/);
    expect(res.headers['warning']).toContain('deprecated');
  });

  it('includes sunset date and successor in Warning message', async () => {
    const app = buildApp([
      deprecate({
        deprecatedAt: DEPRECATED_AT,
        sunsetAt: SUNSET_AT,
        successor: '/api/v2/resource',
      }),
    ]);
    const res = await request(app).get('/resource');
    expect(res.headers['warning']).toContain(SUNSET_AT.toUTCString());
    expect(res.headers['warning']).toContain('/api/v2/resource');
  });

  it('still passes the request to the next handler (200)', async () => {
    const app = buildApp([deprecate({ deprecatedAt: DEPRECATED_AT })]);
    const res = await request(app).get('/resource');
    expect(res.status).toBe(200);
    expect(res.body.data).toBe('ok');
  });

  it('accepts date strings as well as Date objects', async () => {
    const app = buildApp([
      deprecate({ deprecatedAt: '2025-01-01', sunsetAt: '2026-07-01' }),
    ]);
    const res = await request(app).get('/resource');
    expect(res.headers['deprecation']).toBeDefined();
    expect(res.headers['sunset']).toBeDefined();
  });
});

// ── registerDeprecation / getDeprecationRegistry ──────────────────────────────

describe('deprecation registry', () => {
  beforeEach(() => {
    // Clear the module-level registry between tests by re-registering with a
    // unique id — the registry is additive so we use unique keys per test.
  });

  it('registerDeprecation adds an entry to the registry', () => {
    registerDeprecation('reg-test-1', {
      deprecatedAt: DEPRECATED_AT,
      sunsetAt: SUNSET_AT,
      link: 'https://docs.example.com',
      successor: '/api/v1/resource',
    });
    const registry = getDeprecationRegistry();
    expect(registry['reg-test-1']).toBeDefined();
    expect(registry['reg-test-1'].deprecatedAt).toBe(DEPRECATED_AT.toISOString());
    expect(registry['reg-test-1'].sunsetAt).toBe(SUNSET_AT.toISOString());
    expect(registry['reg-test-1'].link).toBe('https://docs.example.com');
    expect(registry['reg-test-1'].successor).toBe('/api/v1/resource');
  });

  it('getDeprecationRegistry returns null for optional fields when not provided', () => {
    registerDeprecation('reg-test-2', { deprecatedAt: DEPRECATED_AT });
    const registry = getDeprecationRegistry();
    expect(registry['reg-test-2'].sunsetAt).toBeNull();
    expect(registry['reg-test-2'].link).toBeNull();
    expect(registry['reg-test-2'].successor).toBeNull();
  });
});

// ── deprecationDiscovery() endpoint ──────────────────────────────────────────

describe('deprecationDiscovery', () => {
  it('returns JSON with registered deprecations', async () => {
    registerDeprecation('discovery-test', {
      deprecatedAt: DEPRECATED_AT,
      sunsetAt: SUNSET_AT,
    });

    const app = express();
    app.get('/.well-known/api-deprecations', deprecationDiscovery());

    const res = await request(app).get('/.well-known/api-deprecations');
    expect(res.status).toBe(200);
    expect(res.body['discovery-test']).toBeDefined();
    expect(res.body['discovery-test'].deprecatedAt).toBe(DEPRECATED_AT.toISOString());
  });
});
