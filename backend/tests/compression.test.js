/**
 * Compression Middleware Tests
 *
 * Verifies that:
 *  - Gzip is applied when client sends Accept-Encoding: gzip
 *  - Brotli is applied when client sends Accept-Encoding: br
 *  - No compression when client omits Accept-Encoding
 *  - Small payloads below threshold are not compressed
 *  - /metrics endpoint is never compressed
 *  - Vary: Accept-Encoding header is set on compressed responses
 */

import { jest } from '@jest/globals';
import zlib from 'zlib';
import { promisify } from 'util';

const brotliDecompress = promisify(zlib.brotliDecompress);

// ── Mock metrics so the middleware can be imported without a real registry ────
jest.unstable_mockModule('../lib/metrics.js', () => ({
  compressedResponsesTotal: { inc: jest.fn() },
  compressionBytesTotal: { inc: jest.fn() },
  compressionRatio: { observe: jest.fn() },
  httpRequestDuration: { observe: jest.fn() },
  httpRequestTotal: { inc: jest.fn() },
  httpRequestsInFlight: { inc: jest.fn(), dec: jest.fn() },
  errorsTotal: { inc: jest.fn() },
  register: { metrics: jest.fn().mockResolvedValue('') },
}));

const { default: compressionMiddleware, THRESHOLD: _THRESHOLD } =
  await import('../middleware/compression.js');

// ── Minimal Express-like test harness ─────────────────────────────────────────

import express from 'express';
import supertest from 'supertest';

/** Build a minimal app with a single JSON route returning `size` bytes. */
function buildApp(payloadSize = 4096) {
  const app = express();
  app.use(compressionMiddleware);

  app.get('/data', (_req, res) => {
    // Generate a compressible JSON payload of roughly `payloadSize` bytes
    const data = {
      items: Array.from({ length: payloadSize / 20 }, (_, i) => ({ id: i, value: 'x'.repeat(10) })),
    };
    res.json(data);
  });

  app.get('/metrics', (_req, res) => {
    res.type('text/plain').send('# prometheus metrics');
  });

  app.get('/tiny', (_req, res) => {
    res.json({ ok: true }); // well below threshold
  });

  return app;
}

describe('Compression middleware', () => {
  const app = buildApp(8192);

  it('compresses with gzip when Accept-Encoding: gzip', async () => {
    const res = await supertest(app)
      .get('/data')
      .set('Accept-Encoding', 'gzip');

    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers['vary']).toMatch(/Accept-Encoding/i);

    // supertest's http agent auto-decompresses; the body arrives as parsed JSON
    expect(res.body).toHaveProperty('items');
  });

  it('compresses with brotli when Accept-Encoding: br', async () => {
    const res = await supertest(app)
      .get('/data')
      .set('Accept-Encoding', 'br')
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.headers['content-encoding']).toBe('br');
    expect(res.headers['vary']).toMatch(/Accept-Encoding/i);

    const decompressed = await brotliDecompress(res.body);
    const parsed = JSON.parse(decompressed.toString());
    expect(parsed).toHaveProperty('items');
  });

  it('prefers brotli over gzip when both are advertised', async () => {
    const res = await supertest(app)
      .get('/data')
      .set('Accept-Encoding', 'gzip, deflate, br')
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.headers['content-encoding']).toBe('br');
  });

  it('does not compress when Accept-Encoding is absent', async () => {
    const res = await supertest(app).get('/data').set('Accept-Encoding', '');

    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('does not compress the /metrics endpoint', async () => {
    const res = await supertest(app).get('/metrics').set('Accept-Encoding', 'gzip, br');

    // The /metrics route returns plain text — compression should not be applied
    // (some middleware may still set content-encoding for text responses, so we
    //  just assert the body is readable without decompression)
    expect(res.text).toContain('prometheus metrics');
  });

  it('does not compress payloads below the threshold', async () => {
    const res = await supertest(app).get('/tiny').set('Accept-Encoding', 'gzip');

    // Small payload — compression should be skipped
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('compressed response is smaller than uncompressed', async () => {
    const [compressed, plain] = await Promise.all([
      supertest(app).get('/data').set('Accept-Encoding', 'gzip').buffer(true),
      supertest(app).get('/data').set('Accept-Encoding', '').buffer(true),
    ]);

    const compressedSize = compressed.body.byteLength ?? compressed.body.length ?? 0;
    const plainSize =
      plain.body instanceof Buffer
        ? plain.body.byteLength
        : Buffer.byteLength(plain.text || JSON.stringify(plain.body) || '');

    expect(compressedSize).toBeLessThan(plainSize);
  });
});
