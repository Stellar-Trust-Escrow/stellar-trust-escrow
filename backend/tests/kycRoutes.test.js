/**
 * KYC Routes — Error Message Tests
 *
 * Verifies that:
 *  1. Each service error code surfaces the correct HTTP status and a
 *     specific, human-readable error message.
 *  2. No raw database or provider error details are forwarded to the caller.
 *  3. Sensitive data (secrets, stack traces) never appears in responses.
 *
 * Strategy: mock kycService so that we can trigger every typed error code
 * in isolation, then assert on the HTTP response without needing a database.
 * The controller is exercised through its exported functions directly, with
 * lightweight mock req/res objects, avoiding the complexity of JWT auth in
 * the middleware chain.
 */

import { jest } from '@jest/globals';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock kycService before importing the controller so the ESM module graph
// picks up the stub.
const kycServiceMock = {
  generateToken: jest.fn(),
  getStatus: jest.fn(),
  processWebhook: jest.fn(),
  listAll: jest.fn(),
  submit: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn(),
  isApproved: jest.fn(),
};

jest.unstable_mockModule('../services/kycService.js', () => ({
  default: kycServiceMock,
}));

// Suppress logControllerError output during tests.
jest.unstable_mockModule('../config/logger.js', () => ({
  logControllerError: jest.fn(),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
  getLogger: jest.fn(() => ({ error: jest.fn() })),
  createModuleLogger: jest.fn(() => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() })),
  requestContext: { getStore: jest.fn(() => null) },
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const { default: kycController } = await import(
  '../api/controllers/kycController.js'
);

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_ADDRESS = `G${'A'.repeat(55)}`;

/** Build a minimal mock request. */
function mockReq(overrides = {}) {
  return {
    body: {},
    params: {},
    headers: {},
    rawBody: '',
    ...overrides,
  };
}

/** Build a mock response that captures status + JSON. */
function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn().mockImplementation(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockImplementation(function (payload) {
      this.body = payload;
      return this;
    }),
  };
  return res;
}

/** Create a typed KYC service error (matches kycService.kycError shape). */
function kycServiceError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ── Test suites ───────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// getToken
// ─────────────────────────────────────────────────────────────────────────────

describe('kycController.getToken', () => {
  it('returns 400 with a specific message when address is missing', async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();

    await kycController.getToken(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/address is required/i);
    expect(res.body.code).toBe('MISSING_ADDRESS');
  });

  it('returns 200 with token on success', async () => {
    kycServiceMock.generateToken.mockResolvedValue('tok_abc123');
    const req = mockReq({ body: { address: VALID_ADDRESS } });
    const res = mockRes();

    await kycController.getToken(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBe('tok_abc123');
  });

  it('returns 500 with generic message when service throws an unexpected error', async () => {
    kycServiceMock.generateToken.mockRejectedValue(new Error('pg: connection refused'));
    const req = mockReq({ body: { address: VALID_ADDRESS } });
    const res = mockRes();

    await kycController.getToken(req, res);

    expect(res.statusCode).toBe(500);
    // Must NOT expose the raw DB error text
    expect(res.body.error).not.toMatch(/pg:/i);
    expect(res.body.error).not.toMatch(/connection refused/i);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });

  it('does not leak stack traces in response body', async () => {
    const err = new Error('SELECT * FROM users WHERE 1=1');
    err.stack = 'Error: SELECT * FROM users WHERE 1=1\n    at kycService (kycService.js:10)';
    kycServiceMock.generateToken.mockRejectedValue(err);
    const req = mockReq({ body: { address: VALID_ADDRESS } });
    const res = mockRes();

    await kycController.getToken(req, res);

    const responseText = JSON.stringify(res.body);
    expect(responseText).not.toContain('kycService.js');
    expect(responseText).not.toContain('SELECT');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('kycController.getStatus', () => {
  it('returns 200 with address and status on success', async () => {
    kycServiceMock.getStatus.mockResolvedValue('pending');
    const req = mockReq({ params: { address: VALID_ADDRESS } });
    const res = mockRes();

    await kycController.getStatus(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ address: VALID_ADDRESS, status: 'pending' });
  });

  it('returns 404 with specific message when record is not found', async () => {
    kycServiceMock.getStatus.mockRejectedValue(
      kycServiceError('KYC_NOT_FOUND', `No KYC record found for address ${VALID_ADDRESS}.`),
    );
    const req = mockReq({ params: { address: VALID_ADDRESS } });
    const res = mockRes();

    await kycController.getStatus(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toMatch(/No KYC record found/);
    expect(res.body.code).toBe('KYC_NOT_FOUND');
  });

  it('returns 500 with generic message on unexpected DB failure', async () => {
    kycServiceMock.getStatus.mockRejectedValue(new Error('ECONNRESET'));
    const req = mockReq({ params: { address: VALID_ADDRESS } });
    const res = mockRes();

    await kycController.getStatus(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/ECONNRESET/i);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// webhook
// ─────────────────────────────────────────────────────────────────────────────

describe('kycController.webhook', () => {
  it('returns 401 with specific message when signature header is absent', async () => {
    const req = mockReq({ headers: {}, rawBody: '{}', body: {} });
    const res = mockRes();

    await kycController.webhook(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/x-app-token/i);
    expect(res.body.code).toBe('KYC_WEBHOOK_MISSING_SIGNATURE');
  });

  it('returns 401 with specific message when service detects invalid signature', async () => {
    kycServiceMock.processWebhook.mockRejectedValue(
      kycServiceError(
        'KYC_WEBHOOK_INVALID_SIGNATURE',
        'Webhook signature verification failed: signature does not match.',
      ),
    );
    const req = mockReq({
      headers: { 'x-app-token': 'bad_sig' },
      rawBody: '{"type":"applicantReviewed"}',
      body: { type: 'applicantReviewed' },
    });
    const res = mockRes();

    await kycController.webhook(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/signature.*failed|signature.*match/i);
    expect(res.body.code).toBe('KYC_WEBHOOK_INVALID_SIGNATURE');
  });

  it('returns 400 with specific message when event type field is missing', async () => {
    kycServiceMock.processWebhook.mockRejectedValue(
      kycServiceError(
        'KYC_WEBHOOK_MISSING_EVENT',
        "Webhook payload is missing the required 'type' field.",
      ),
    );
    const req = mockReq({
      headers: { 'x-app-token': 'valid_sig' },
      rawBody: '{}',
      body: {},
    });
    const res = mockRes();

    await kycController.webhook(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/missing.*type|type.*missing/i);
    expect(res.body.code).toBe('KYC_WEBHOOK_MISSING_EVENT');
  });

  it('returns 400 with specific message when event type is unsupported', async () => {
    kycServiceMock.processWebhook.mockRejectedValue(
      kycServiceError(
        'KYC_WEBHOOK_UNSUPPORTED_EVENT',
        "Unsupported reviewAnswer value: 'YELLOW'. Expected GREEN or RED.",
      ),
    );
    const req = mockReq({
      headers: { 'x-app-token': 'valid_sig' },
      rawBody: '{"type":"applicantReviewed"}',
      body: { type: 'applicantReviewed' },
    });
    const res = mockRes();

    await kycController.webhook(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/unsupported|YELLOW/i);
    expect(res.body.code).toBe('KYC_WEBHOOK_UNSUPPORTED_EVENT');
  });

  it('returns 200 when webhook is processed successfully', async () => {
    kycServiceMock.processWebhook.mockResolvedValue({ status: 'approved' });
    const req = mockReq({
      headers: { 'x-app-token': 'valid_sig' },
      rawBody: '{"type":"applicantReviewed"}',
      body: { type: 'applicantReviewed' },
    });
    const res = mockRes();

    await kycController.webhook(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.received).toBe(true);
  });

  it('returns 500 with generic message on unexpected webhook processing error', async () => {
    kycServiceMock.processWebhook.mockRejectedValue(new Error('redis: NOAUTH'));
    const req = mockReq({
      headers: { 'x-app-token': 'valid_sig' },
      rawBody: '{}',
      body: {},
    });
    const res = mockRes();

    await kycController.webhook(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).not.toMatch(/redis|NOAUTH/i);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// adminList
// ─────────────────────────────────────────────────────────────────────────────

describe('kycController.adminList', () => {
  it('returns 200 with a records array on success', async () => {
    const fakeRecords = [
      { address: VALID_ADDRESS, status: 'approved', submittedAt: new Date().toISOString() },
    ];
    kycServiceMock.listAll.mockResolvedValue(fakeRecords);
    const req = mockReq();
    const res = mockRes();

    await kycController.adminList(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.records).toEqual(fakeRecords);
  });

  it('returns 500 with generic message when DB query fails', async () => {
    kycServiceMock.listAll.mockRejectedValue(
      new Error("relation 'kycRecord' does not exist"),
    );
    const req = mockReq();
    const res = mockRes();

    await kycController.adminList(req, res);

    expect(res.statusCode).toBe(500);
    // Raw SQL/DB text must not reach the caller
    expect(res.body.error).not.toMatch(/relation|does not exist/i);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error code → HTTP status mapping (comprehensive table test)
// ─────────────────────────────────────────────────────────────────────────────

describe('kycController error code → HTTP status mapping', () => {
  const cases = [
    { code: 'KYC_NOT_FOUND',                   expectedStatus: 404 },
    { code: 'KYC_ALREADY_APPROVED',             expectedStatus: 409 },
    { code: 'KYC_ALREADY_SUBMITTED',            expectedStatus: 409 },
    { code: 'KYC_INVALID_STATUS',               expectedStatus: 400 },
    { code: 'KYC_WEBHOOK_INVALID_SIGNATURE',    expectedStatus: 401 },
    { code: 'KYC_WEBHOOK_MISSING_EVENT',        expectedStatus: 400 },
    { code: 'KYC_WEBHOOK_UNSUPPORTED_EVENT',    expectedStatus: 400 },
    { code: 'UNKNOWN_CODE',                     expectedStatus: 500 },
  ];

  test.each(cases)(
    'service error with code $code maps to HTTP $expectedStatus',
    async ({ code, expectedStatus }) => {
      kycServiceMock.getStatus.mockRejectedValue(
        kycServiceError(code, `Test error: ${code}`),
      );
      const req = mockReq({ params: { address: VALID_ADDRESS } });
      const res = mockRes();

      await kycController.getStatus(req, res);

      expect(res.statusCode).toBe(expectedStatus);
      // The error message must always be a non-empty string
      expect(typeof res.body.error).toBe('string');
      expect(res.body.error.length).toBeGreaterThan(0);
      // Known codes are reflected; unknown codes produce INTERNAL_ERROR
      if (code === 'UNKNOWN_CODE') {
        expect(res.body.code).toBe('INTERNAL_ERROR');
      } else {
        expect(res.body.code).toBe(code);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Security — sensitive data never leaks
// ─────────────────────────────────────────────────────────────────────────────

describe('kycController — sensitive data is never leaked', () => {
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /token/i,          // raw tokens should not appear in error bodies
    /DATABASE_URL/i,
    /postgresql:\/\//i,
    /Error:\s+at\s/,   // stack trace lines
  ];

  it('does not include sensitive patterns in a 500 error response', async () => {
    const err = new Error(
      'Error connecting to postgresql://admin:supersecret@db:5432/kyc',
    );
    err.stack = `Error: ...\n    at kycService.getStatus (kycService.js:50:15)`;
    kycServiceMock.getStatus.mockRejectedValue(err);

    const req = mockReq({ params: { address: VALID_ADDRESS } });
    const res = mockRes();

    await kycController.getStatus(req, res);

    const responseText = JSON.stringify(res.body);
    for (const pattern of sensitivePatterns) {
      expect(responseText).not.toMatch(pattern);
    }
  });
});
