import { jest } from '@jest/globals';
import { createHmac } from 'crypto';

// ── Mocks ──────────────────────────────────────────────────────────────────

const kycServiceMock = {
  createToken: jest.fn(),
  getStatus: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn(),
  listAll: jest.fn(),
};

jest.unstable_mockModule('../services/kycService.js', () => ({
  default: kycServiceMock,
}));

const { default: kycController } = await import('../api/controllers/kycController.js');

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Minimal mock of Express's `res` object, recording the last status code and
 * JSON body so tests can assert on them without a real HTTP server.
 */
function createMockRes() {
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

const TEST_ADDRESS = 'GCKFBEIYTKP5RDBQNPZJNZDMFK5VLZPNZQO7CXNBYKPBZV4UCKFBEIY';

beforeEach(() => {
  jest.clearAllMocks();
  // Restore SUMSUB_WEBHOOK_SECRET to a safe default between tests.
  process.env.SUMSUB_WEBHOOK_SECRET = 'test-secret-32-bytes-xxxxxxxxxx';
});

// ── getToken ───────────────────────────────────────────────────────────────

describe('kycController.getToken', () => {
  it('returns 501 with KYC_TOKEN_NOT_IMPLEMENTED when createToken is not a function', async () => {
    // Temporarily remove the function to simulate "not yet implemented"
    const originalCreateToken = kycServiceMock.createToken;
    delete kycServiceMock.createToken;

    const req = { body: { address: TEST_ADDRESS } };
    const res = createMockRes();

    await kycController.getToken(req, res);

    expect(res.statusCode).toBe(501);
    expect(res.body.code).toBe('KYC_TOKEN_NOT_IMPLEMENTED');
    expect(res.body.error).toMatch(/not yet implemented/i);

    // Restore for subsequent tests
    kycServiceMock.createToken = originalCreateToken;
  });

  it('returns token and userId on success', async () => {
    kycServiceMock.createToken.mockResolvedValue({
      token: 'sdk_token_abc',
      userId: 'user_123',
    });

    const req = { body: { address: TEST_ADDRESS } };
    const res = createMockRes();

    await kycController.getToken(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ token: 'sdk_token_abc', userId: 'user_123' });
  });

  it('returns 502 with KYC_PROVIDER_ERROR when Sumsub API returns an HTTP error', async () => {
    const axiosError = new Error('Request failed with status code 503');
    axiosError.response = { status: 503 };
    kycServiceMock.createToken.mockRejectedValue(axiosError);

    const req = { body: { address: TEST_ADDRESS } };
    const res = createMockRes();

    await kycController.getToken(req, res);

    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('KYC_PROVIDER_ERROR');
    expect(res.body.providerStatus).toBe(503);
    // Must not leak the raw error message which may contain internal details
    expect(res.body.error).not.toContain('Request failed');
  });

  it('returns 502 with KYC_PROVIDER_ERROR when error message mentions sumsub', async () => {
    const err = new Error('sumsub service unavailable');
    kycServiceMock.createToken.mockRejectedValue(err);

    const req = { body: { address: TEST_ADDRESS } };
    const res = createMockRes();

    await kycController.getToken(req, res);

    expect(res.statusCode).toBe(502);
    expect(res.body.code).toBe('KYC_PROVIDER_ERROR');
  });

  it('returns 500 with KYC_TOKEN_INTERNAL_ERROR on unexpected DB/internal errors', async () => {
    kycServiceMock.createToken.mockRejectedValue(new Error('Unexpected DB error'));

    const req = { body: { address: TEST_ADDRESS } };
    const res = createMockRes();

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await kycController.getToken(req, res);
    consoleSpy.mockRestore();

    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('KYC_TOKEN_INTERNAL_ERROR');
    expect(res.body.error).toMatch(/unexpected error/i);
  });

  it('does not include secrets or raw error details in any error response', async () => {
    // Simulate an error whose message contains a sensitive string
    const sensitiveErr = new Error('token=super-secret-value; failed to call sumsub');
    sensitiveErr.response = { status: 401 };
    kycServiceMock.createToken.mockRejectedValue(sensitiveErr);

    const req = { body: { address: TEST_ADDRESS } };
    const res = createMockRes();

    await kycController.getToken(req, res);

    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('super-secret-value');
    expect(bodyStr).not.toContain('token=');
  });
});

// ── getStatus ──────────────────────────────────────────────────────────────

describe('kycController.getStatus', () => {
  it('returns 200 with address and status when a record exists', async () => {
    kycServiceMock.getStatus.mockResolvedValue('approved');

    const req = { params: { address: TEST_ADDRESS } };
    const res = createMockRes();

    await kycController.getStatus(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ address: TEST_ADDRESS, status: 'approved' });
  });

  it('returns 404 with KYC_RECORD_NOT_FOUND when status is not_started', async () => {
    kycServiceMock.getStatus.mockResolvedValue('not_started');

    const req = { params: { address: TEST_ADDRESS } };
    const res = createMockRes();

    await kycController.getStatus(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('KYC_RECORD_NOT_FOUND');
    expect(res.body.address).toBe(TEST_ADDRESS);
    expect(res.body.error).toContain(TEST_ADDRESS);
  });

  it('returns 404 with KYC_RECORD_NOT_FOUND on Prisma P2025 error', async () => {
    const prismaError = new Error('Record to update not found');
    prismaError.code = 'P2025';
    kycServiceMock.getStatus.mockRejectedValue(prismaError);

    const req = { params: { address: TEST_ADDRESS } };
    const res = createMockRes();

    await kycController.getStatus(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('KYC_RECORD_NOT_FOUND');
  });

  it('returns 404 when error message includes "No KYC record"', async () => {
    kycServiceMock.getStatus.mockRejectedValue(new Error('No KYC record found'));

    const req = { params: { address: TEST_ADDRESS } };
    const res = createMockRes();

    await kycController.getStatus(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe('KYC_RECORD_NOT_FOUND');
  });

  it('returns 500 with KYC_STATUS_INTERNAL_ERROR on unexpected failures', async () => {
    kycServiceMock.getStatus.mockRejectedValue(new Error('Connection reset'));

    const req = { params: { address: TEST_ADDRESS } };
    const res = createMockRes();

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await kycController.getStatus(req, res);
    consoleSpy.mockRestore();

    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('KYC_STATUS_INTERNAL_ERROR');
    // The error message should include the address for context
    expect(res.body.error).toContain(TEST_ADDRESS);
  });
});

// ── webhook ────────────────────────────────────────────────────────────────

describe('kycController.webhook', () => {
  const WEBHOOK_SECRET = 'test-secret-32-bytes-xxxxxxxxxx';
  const VALID_BODY = JSON.stringify({
    type: 'applicantReviewed',
    applicantId: 'app_123',
    externalUserId: TEST_ADDRESS,
    reviewResult: { reviewAnswer: 'GREEN' },
  });

  /** Produces a signature that matches WEBHOOK_SECRET + VALID_BODY */
  function validSignature() {
    return createHmac('sha256', WEBHOOK_SECRET).update(VALID_BODY).digest('hex');
  }

  it('returns 500 with KYC_WEBHOOK_SECRET_MISSING when env var is absent', async () => {
    delete process.env.SUMSUB_WEBHOOK_SECRET;

    const req = {
      headers: {},
      rawBody: VALID_BODY,
      body: JSON.parse(VALID_BODY),
    };
    const res = createMockRes();

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await kycController.webhook(req, res);
    consoleSpy.mockRestore();

    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('KYC_WEBHOOK_SECRET_MISSING');
    expect(res.body.error).toMatch(/signing secret/i);
  });

  it('returns 400 with KYC_WEBHOOK_MISSING_SIGNATURE when header is absent', async () => {
    const req = {
      headers: {}, // no x-payload-digest
      rawBody: VALID_BODY,
      body: JSON.parse(VALID_BODY),
    };
    const res = createMockRes();

    await kycController.webhook(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('KYC_WEBHOOK_MISSING_SIGNATURE');
    expect(res.body.error).toContain('x-payload-digest');
  });

  it('returns 400 with KYC_WEBHOOK_INVALID_SIGNATURE when signature is wrong', async () => {
    const req = {
      headers: { 'x-payload-digest': 'a'.repeat(64) },
      rawBody: VALID_BODY,
      body: JSON.parse(VALID_BODY),
    };
    const res = createMockRes();

    await kycController.webhook(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('KYC_WEBHOOK_INVALID_SIGNATURE');
    expect(res.body.error).toMatch(/signature verification failed/i);
  });

  it('returns 400 with KYC_WEBHOOK_MALFORMED_PAYLOAD when required fields are missing', async () => {
    // Craft a valid signature for a body that lacks required fields
    const malformedBody = '{}';
    const sig = createHmac('sha256', WEBHOOK_SECRET).update(malformedBody).digest('hex');

    const req = {
      headers: { 'x-payload-digest': sig },
      rawBody: malformedBody,
      body: {},
    };
    const res = createMockRes();

    await kycController.webhook(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('KYC_WEBHOOK_MALFORMED_PAYLOAD');
    expect(res.body.error).toMatch(/type.*applicantId/i);
  });

  it('returns 400 with KYC_WEBHOOK_MISSING_REVIEW_ANSWER when reviewAnswer is absent', async () => {
    const body = JSON.stringify({
      type: 'applicantReviewed',
      applicantId: 'app_123',
      externalUserId: TEST_ADDRESS,
      reviewResult: {},
    });
    const sig = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

    const req = {
      headers: { 'x-payload-digest': sig },
      rawBody: body,
      body: JSON.parse(body),
    };
    const res = createMockRes();

    await kycController.webhook(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('KYC_WEBHOOK_MISSING_REVIEW_ANSWER');
    expect(res.body.error).toMatch(/reviewResult\.reviewAnswer/i);
  });

  it('returns 400 with KYC_WEBHOOK_MISSING_EXTERNAL_USER_ID when externalUserId is absent', async () => {
    const body = JSON.stringify({
      type: 'applicantReviewed',
      applicantId: 'app_123',
      reviewResult: { reviewAnswer: 'GREEN' },
    });
    const sig = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

    const req = {
      headers: { 'x-payload-digest': sig },
      rawBody: body,
      body: JSON.parse(body),
    };
    const res = createMockRes();

    await kycController.webhook(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('KYC_WEBHOOK_MISSING_EXTERNAL_USER_ID');
    expect(res.body.error).toMatch(/externalUserId/i);
  });

  it('calls kycService.approve and returns { received: true } on GREEN review', async () => {
    kycServiceMock.approve.mockResolvedValue({});
    const sig = createHmac('sha256', WEBHOOK_SECRET).update(VALID_BODY).digest('hex');

    const req = {
      headers: { 'x-payload-digest': sig },
      rawBody: VALID_BODY,
      body: JSON.parse(VALID_BODY),
    };
    const res = createMockRes();

    await kycController.webhook(req, res);

    expect(kycServiceMock.approve).toHaveBeenCalledWith(TEST_ADDRESS);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('calls kycService.reject with reject labels on RED review', async () => {
    kycServiceMock.reject.mockResolvedValue({});

    const body = JSON.stringify({
      type: 'applicantReviewed',
      applicantId: 'app_123',
      externalUserId: TEST_ADDRESS,
      reviewResult: { reviewAnswer: 'RED', rejectLabels: ['FORGERY', 'EXPIRED'] },
    });
    const sig = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

    const req = {
      headers: { 'x-payload-digest': sig },
      rawBody: body,
      body: JSON.parse(body),
    };
    const res = createMockRes();

    await kycController.webhook(req, res);

    expect(kycServiceMock.reject).toHaveBeenCalledWith(
      TEST_ADDRESS,
      expect.stringContaining('FORGERY'),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('acknowledges non-applicantReviewed events without calling approve/reject', async () => {
    const body = JSON.stringify({
      type: 'applicantCreated',
      applicantId: 'app_456',
      externalUserId: TEST_ADDRESS,
    });
    const sig = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');

    const req = {
      headers: { 'x-payload-digest': sig },
      rawBody: body,
      body: JSON.parse(body),
    };
    const res = createMockRes();

    await kycController.webhook(req, res);

    expect(kycServiceMock.approve).not.toHaveBeenCalled();
    expect(kycServiceMock.reject).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  it('returns 422 with KYC_WEBHOOK_APPLICANT_NOT_FOUND on Prisma P2025 during event processing', async () => {
    const p2025 = new Error('Record not found');
    p2025.code = 'P2025';
    kycServiceMock.approve.mockRejectedValue(p2025);

    const sig = createHmac('sha256', WEBHOOK_SECRET).update(VALID_BODY).digest('hex');

    const req = {
      headers: { 'x-payload-digest': sig },
      rawBody: VALID_BODY,
      body: JSON.parse(VALID_BODY),
    };
    const res = createMockRes();

    await kycController.webhook(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe('KYC_WEBHOOK_APPLICANT_NOT_FOUND');
    expect(res.body.error).toMatch(/no local record/i);
  });

  it('returns 500 with KYC_WEBHOOK_INTERNAL_ERROR on unexpected service failures', async () => {
    kycServiceMock.approve.mockRejectedValue(new Error('Database connection lost'));

    const sig = createHmac('sha256', WEBHOOK_SECRET).update(VALID_BODY).digest('hex');

    const req = {
      headers: { 'x-payload-digest': sig },
      rawBody: VALID_BODY,
      body: JSON.parse(VALID_BODY),
    };
    const res = createMockRes();

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await kycController.webhook(req, res);
    consoleSpy.mockRestore();

    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('KYC_WEBHOOK_INTERNAL_ERROR');
    expect(res.body.error).not.toContain('Database connection lost');
  });
});

// ── adminList ──────────────────────────────────────────────────────────────

describe('kycController.adminList', () => {
  it('returns paginated KYC records on success', async () => {
    kycServiceMock.listAll.mockResolvedValue({
      records: [{ address: TEST_ADDRESS, status: 'Approved' }],
      total: 1,
    });

    const req = { query: { page: '1', limit: '20' } };
    const res = createMockRes();

    await kycController.adminList(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('returns 501 with KYC_ADMIN_LIST_NOT_IMPLEMENTED when listAll is not a function', async () => {
    const originalListAll = kycServiceMock.listAll;
    delete kycServiceMock.listAll;

    const req = { query: {} };
    const res = createMockRes();

    await kycController.adminList(req, res);

    expect(res.statusCode).toBe(501);
    expect(res.body.code).toBe('KYC_ADMIN_LIST_NOT_IMPLEMENTED');

    kycServiceMock.listAll = originalListAll;
  });

  it('returns 400 with KYC_ADMIN_INVALID_STATUS for an unrecognised status value', async () => {
    const req = { query: { status: 'UNKNOWN_STATUS' } };
    const res = createMockRes();

    await kycController.adminList(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('KYC_ADMIN_INVALID_STATUS');
    // The allowed values must be surfaced to the caller
    expect(res.body.allowedValues).toEqual(
      expect.arrayContaining(['Pending', 'Approved', 'Declined']),
    );
  });

  it('returns 400 with KYC_ADMIN_INVALID_PAGE for a non-integer page', async () => {
    const req = { query: { page: 'abc' } };
    const res = createMockRes();

    await kycController.adminList(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('KYC_ADMIN_INVALID_PAGE');
    expect(res.body.error).toContain("'page'");
  });

  it('returns 400 with KYC_ADMIN_INVALID_PAGE for page < 1', async () => {
    const req = { query: { page: '0' } };
    const res = createMockRes();

    await kycController.adminList(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('KYC_ADMIN_INVALID_PAGE');
  });

  it('returns 400 with KYC_ADMIN_INVALID_LIMIT for limit > 100', async () => {
    const req = { query: { limit: '101' } };
    const res = createMockRes();

    await kycController.adminList(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('KYC_ADMIN_INVALID_LIMIT');
    expect(res.body.error).toContain("'limit'");
  });

  it('returns 400 with KYC_ADMIN_INVALID_LIMIT for limit < 1', async () => {
    const req = { query: { limit: '0' } };
    const res = createMockRes();

    await kycController.adminList(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('KYC_ADMIN_INVALID_LIMIT');
  });

  it('accepts valid status values without error', async () => {
    kycServiceMock.listAll.mockResolvedValue({ records: [], total: 0 });

    for (const status of ['Pending', 'Init', 'Processing', 'Approved', 'Declined']) {
      const req = { query: { status } };
      const res = createMockRes();

      await kycController.adminList(req, res);

      expect(res.statusCode).toBe(200);
    }
  });

  it('returns 500 with KYC_ADMIN_LIST_INTERNAL_ERROR on service failure', async () => {
    kycServiceMock.listAll.mockRejectedValue(new Error('DB timeout'));

    const req = { query: {} };
    const res = createMockRes();

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await kycController.adminList(req, res);
    consoleSpy.mockRestore();

    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('KYC_ADMIN_LIST_INTERNAL_ERROR');
    expect(res.body.error).not.toContain('DB timeout');
  });

  it('computes totalPages correctly for fractional page counts', async () => {
    kycServiceMock.listAll.mockResolvedValue({ records: [], total: 25 });

    const req = { query: { limit: '10' } };
    const res = createMockRes();

    await kycController.adminList(req, res);

    expect(res.body.pagination.totalPages).toBe(3); // ceil(25/10)
  });
});
