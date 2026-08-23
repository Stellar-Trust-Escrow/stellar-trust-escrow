import { jest } from '@jest/globals';
import { auditHeaders } from '../../scripts/audit-security-headers.js';

function mockResponse(headerPairs, status = 200) {
  return { status, headers: new Map(headerPairs) };
}

beforeEach(() => {
  global.fetch = jest.fn();
});

describe('auditHeaders — complete, correct headers', () => {
  it('scores 100 and has no critical failures', async () => {
    global.fetch.mockResolvedValue(
      mockResponse([
        ['content-security-policy', "default-src 'self'; script-src 'self'"],
        ['strict-transport-security', 'max-age=63072000; includeSubDomains; preload'],
        ['x-frame-options', 'DENY'],
        ['x-content-type-options', 'nosniff'],
        ['referrer-policy', 'strict-origin-when-cross-origin'],
        ['permissions-policy', 'camera=(), microphone=(), geolocation=()'],
      ]),
    );

    const result = await auditHeaders('http://localhost:4000/healthz');

    expect(result.score).toBe(100);
    expect(result.criticalFailures).toHaveLength(0);
  });

  it('parses a multi-directive, semicolon-separated CSP correctly', async () => {
    global.fetch.mockResolvedValue(
      mockResponse([
        [
          'content-security-policy',
          "default-src 'self'; script-src 'self' https://cdn.example.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
        ],
        ['strict-transport-security', 'max-age=63072000; includeSubDomains'],
      ]),
    );

    const result = await auditHeaders('http://localhost:4000/healthz');
    const cspResult = result.results.find((r) => r.name === 'Content-Security-Policy');

    expect(cspResult.points).toBe(cspResult.max); // full marks — self default-src, no unsafe-eval
    expect(cspResult.messages).toHaveLength(0);
  });
});

describe('auditHeaders — missing headers', () => {
  it('scores 0 and flags both critical headers when nothing is set', async () => {
    global.fetch.mockResolvedValue(mockResponse([]));

    const result = await auditHeaders('http://localhost:4000/healthz');

    expect(result.score).toBe(0);
    expect(result.criticalFailures.map((f) => f.name)).toEqual(
      expect.arrayContaining(['Content-Security-Policy', 'Strict-Transport-Security']),
    );
  });

  it('flags CSP as critical when it contains unsafe-eval', async () => {
    global.fetch.mockResolvedValue(
      mockResponse([
        ['content-security-policy', "default-src 'self'; script-src 'self' 'unsafe-eval'"],
        ['strict-transport-security', 'max-age=63072000; includeSubDomains'],
      ]),
    );

    const result = await auditHeaders('http://localhost:4000/healthz');
    const cspResult = result.results.find((r) => r.name === 'Content-Security-Policy');

    expect(cspResult.messages).toEqual(expect.arrayContaining([expect.stringContaining('unsafe-eval')]));
    expect(result.criticalFailures.some((f) => f.name === 'Content-Security-Policy')).toBe(true);
  });

  it('flags HSTS as critical when max-age is below the 1-year minimum', async () => {
    global.fetch.mockResolvedValue(
      mockResponse([
        ['content-security-policy', "default-src 'self'"],
        ['strict-transport-security', 'max-age=3600; includeSubDomains'],
      ]),
    );

    const result = await auditHeaders('http://localhost:4000/healthz');

    expect(result.criticalFailures.some((f) => f.name === 'Strict-Transport-Security')).toBe(true);
  });
});

describe('auditHeaders — partial headers', () => {
  it('scores 90-99 and has no critical failures when only Permissions-Policy is missing', async () => {
    global.fetch.mockResolvedValue(
      mockResponse([
        ['content-security-policy', "default-src 'self'; script-src 'self'"],
        ['strict-transport-security', 'max-age=63072000; includeSubDomains'],
        ['x-frame-options', 'SAMEORIGIN'],
        ['x-content-type-options', 'nosniff'],
        ['referrer-policy', 'strict-origin-when-cross-origin'],
      ]),
    );

    const result = await auditHeaders('http://localhost:4000/healthz');

    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.score).toBeLessThan(100);
    expect(result.criticalFailures).toHaveLength(0);
  });

  it('rejects X-Frame-Options values other than DENY/SAMEORIGIN', async () => {
    global.fetch.mockResolvedValue(mockResponse([['x-frame-options', 'ALLOW-FROM https://evil.example']]));

    const result = await auditHeaders('http://localhost:4000/healthz');
    const xfo = result.results.find((r) => r.name === 'X-Frame-Options');

    expect(xfo.points).toBe(0);
  });

  it('accepts Referrer-Policy values stricter than the minimum', async () => {
    global.fetch.mockResolvedValue(mockResponse([['referrer-policy', 'no-referrer']]));

    const result = await auditHeaders('http://localhost:4000/healthz');
    const rp = result.results.find((r) => r.name === 'Referrer-Policy');

    expect(rp.points).toBe(rp.max);
  });

  it('requires Permissions-Policy to disable all three of camera/microphone/geolocation', async () => {
    global.fetch.mockResolvedValue(mockResponse([['permissions-policy', 'camera=(), microphone=(self)']]));

    const result = await auditHeaders('http://localhost:4000/healthz');
    const pp = result.results.find((r) => r.name === 'Permissions-Policy');

    expect(pp.points).toBe(0); // geolocation not disabled, microphone allows self
  });
});
