/**
 * Unit and integration tests for the API error handling system.
 * Covers: AppError subclasses, ErrorHandler, Prisma normalization,
 * ErrorLogger, escrowController, and supertest integration.
 */

import { jest } from '@jest/globals';

// ─── 9.3 / 9.6: Mock prisma and sentry before any imports ────────────────────

const prismaMock = {
  escrow: {
    findUnique: jest.fn(),
  },
  milestone: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: prismaMock,
  startConnectionMonitoring: jest.fn(),
}));

jest.unstable_mockModule('../lib/sentry.js', () => ({
  default: {},
}));

// Mock @sentry/node to avoid initialization issues
jest.unstable_mockModule('@sentry/node', () => ({
  init: jest.fn(),
  expressRequestHandler: () => (_req, _res, next) => next(),
  expressTracingHandler: () => (_req, _res, next) => next(),
  expressErrorHandler: () => (_err, _req, _res, next) => next(_err),
  captureException: jest.fn(),
  httpIntegration: jest.fn(),
  expressIntegration: jest.fn(),
}));

// Mock cache to avoid side effects
jest.unstable_mockModule('../lib/cache.js', () => ({
  default: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
    analytics: jest.fn().mockReturnValue({}),
  },
}));

// Mock websocket handlers to avoid ws server startup
jest.unstable_mockModule('../api/websocket/handlers.js', () => ({
  createWebSocketServer: jest.fn(),
  pool: { getMetrics: jest.fn().mockReturnValue({}) },
}));

// Mock email service
jest.unstable_mockModule('../services/emailService.js', () => ({
  default: { start: jest.fn() },
}));

// Mock event indexer
jest.unstable_mockModule('../services/escrowIndexer.js', () => ({
  startIndexer: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../services/eventIndexer.js', () => ({
  startIndexer: jest.fn().mockResolvedValue(undefined),
}));

// Mock responseTime middleware to avoid "headers already sent" in tests
jest.unstable_mockModule('../middleware/responseTime.js', () => ({
  default: (_req, _res, next) => next(),
}));

// Mock paymentService to avoid stripe dependency (stripe not installed)
jest.unstable_mockModule('../services/paymentService.js', () => ({
  default: {
    createCheckoutSession: jest.fn(),
    handleWebhook: jest.fn(),
  },
}));

// Mock paymentController to avoid transitive stripe import
jest.unstable_mockModule('../api/controllers/paymentController.js', () => ({
  default: {
    createCheckout: jest.fn((_req, _res, next) => next()),
    getStatus: jest.fn((_req, _res, next) => next()),
    listByAddress: jest.fn((_req, _res, next) => next()),
    refund: jest.fn((_req, _res, next) => next()),
    webhook: jest.fn((_req, _res, next) => next()),
  },
}));

// Mock prismaMetrics to avoid Prisma client issues
jest.unstable_mockModule('../lib/prismaMetrics.js', () => ({
  attachPrismaMetrics: jest.fn(),
}));

// Mock connectionMonitor
jest.unstable_mockModule('../lib/connectionMonitor.js', () => ({
  attachConnectionMonitoring: jest.fn(),
  startConnectionMonitoring: jest.fn(),
}));

// Mock retryUtils
jest.unstable_mockModule('../lib/retryUtils.js', () => ({
  attachRetryMiddleware: jest.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

const {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  InternalError,
} = await import('../lib/errors.js');

const { default: errorHandler } = await import('../middleware/errorHandler.js');
const { default: errorLogger } = await import('../lib/errorLogger.js');
const { default: escrowController } = await import('../api/controllers/escrowController.js');

// ─── Helper: run errorHandler synchronously ───────────────────────────────────

function runHandler(err, { requestId, nodeEnv } = {}) {
  const savedEnv = process.env.NODE_ENV;
  if (nodeEnv !== undefined) process.env.NODE_ENV = nodeEnv;

  const req = {
    headers: requestId ? { 'x-request-id': requestId } : {},
    path: '/test',
    method: 'GET',
    url: '/test',
  };

  let capturedStatus = null;
  let capturedBody = null;
  const capturedHeaders = {};

  const res = {
    setHeader(name, value) {
      capturedHeaders[name.toLowerCase()] = value;
    },
    status(code) {
      capturedStatus = code;
      return this;
    },
    json(body) {
      capturedBody = body;
    },
  };

  errorHandler(err, req, res, () => {});

  process.env.NODE_ENV = savedEnv;

  return { status: capturedStatus, body: capturedBody, headers: capturedHeaders };
}

// ─── 9.1: AppError subclass unit tests ───────────────────────────────────────

describe('9.1 AppError subclasses', () => {
  const cases = [
    { Cls: ValidationError, statusCode: 400, code: 'VALIDATION_ERROR', isOperational: true },
    { Cls: NotFoundError, statusCode: 404, code: 'NOT_FOUND', isOperational: true },
    { Cls: UnauthorizedError, statusCode: 401, code: 'UNAUTHORIZED', isOperational: true },
    { Cls: ForbiddenError, statusCode: 403, code: 'FORBIDDEN', isOperational: true },
    { Cls: ConflictError, statusCode: 409, code: 'CONFLICT', isOperational: true },
    { Cls: InternalError, statusCode: 500, code: 'INTERNAL_ERROR', isOperational: false },
  ];

  for (const { Cls, statusCode, code, isOperational } of cases) {
    describe(Cls.name, () => {
      it(`has statusCode ${statusCode}`, () => {
        expect(new Cls('msg').statusCode).toBe(statusCode);
      });

      it(`has code "${code}"`, () => {
        expect(new Cls('msg').code).toBe(code);
      });

      it(`has isOperational = ${isOperational}`, () => {
        expect(new Cls('msg').isOperational).toBe(isOperational);
      });

      it('preserves custom message', () => {
        const msg = 'custom error message';
        expect(new Cls(msg).message).toBe(msg);
      });

      it('is an instance of AppError and Error', () => {
        const err = new Cls('msg');
        expect(err).toBeInstanceOf(AppError);
        expect(err).toBeInstanceOf(Error);
      });
    });
  }
});

// ─── 9.2: ErrorHandler response shape and status codes ───────────────────────

describe('9.2 ErrorHandler response shape and status codes', () => {
  const subclassCases = [
    { Cls: ValidationError, statusCode: 400, code: 'VALIDATION_ERROR' },
    { Cls: NotFoundError, statusCode: 404, code: 'NOT_FOUND' },
    { Cls: UnauthorizedError, statusCode: 401, code: 'UNAUTHORIZED' },
    { Cls: ForbiddenError, statusCode: 403, code: 'FORBIDDEN' },
    { Cls: ConflictError, statusCode: 409, code: 'CONFLICT' },
    { Cls: InternalError, statusCode: 500, code: 'INTERNAL_ERROR' },
  ];

  for (const { Cls, statusCode, code } of subclassCases) {
    it(`${Cls.name} → HTTP ${statusCode} with code "${code}"`, () => {
      const err = new Cls('test message');
      const { status, body } = runHandler(err, { nodeEnv: 'development' });
      expect(status).toBe(statusCode);
      expect(body.error.code).toBe(code);
      expect(typeof body.error.message).toBe('string');
      expect(typeof body.error.requestId).toBe('string');
    });
  }

  it('plain Error → HTTP 500 with code "INTERNAL_ERROR"', () => {
    const { status, body } = runHandler(new Error('boom'), { nodeEnv: 'development' });
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });

  it('includes stack field in development', () => {
    const { body } = runHandler(new NotFoundError('x'), { nodeEnv: 'development' });
    expect(typeof body.error.stack).toBe('string');
    expect(body.error.stack.length).toBeGreaterThan(0);
  });

  it('omits stack field in production', () => {
    const { body } = runHandler(new NotFoundError('x'), { nodeEnv: 'production' });
    expect('stack' in body.error).toBe(false);
  });

  it('replaces non-operational error message in production', () => {
    const err = new Error('internal details');
    const { body } = runHandler(err, { nodeEnv: 'production' });
    expect(body.error.message).toBe('An unexpected error occurred');
  });

  it('preserves operational error message in production', () => {
    const err = new NotFoundError('Escrow not found');
    const { body } = runHandler(err, { nodeEnv: 'production' });
    expect(body.error.message).toBe('Escrow not found');
  });

  it('sets Content-Type to application/json', () => {
    const { headers } = runHandler(new NotFoundError('x'), { nodeEnv: 'development' });
    expect(headers['content-type']).toBe('application/json');
  });
});

// ─── 9.3: Prisma error normalization ─────────────────────────────────────────

describe('9.3 Prisma error normalization', () => {
  it('PrismaClientKnownRequestError P2025 → HTTP 404 NOT_FOUND', () => {
    const prismaErr = new Error('Record not found');
    Object.defineProperty(prismaErr, 'constructor', {
      value: { name: 'PrismaClientKnownRequestError' },
      writable: true,
    });
    prismaErr.code = 'P2025';

    const { status, body } = runHandler(prismaErr, { nodeEnv: 'development' });
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('PrismaClientValidationError → HTTP 400 VALIDATION_ERROR with "Invalid request data"', () => {
    const prismaErr = new Error('some prisma validation message');
    Object.defineProperty(prismaErr, 'constructor', {
      value: { name: 'PrismaClientValidationError' },
      writable: true,
    });

    const { status, body } = runHandler(prismaErr, { nodeEnv: 'development' });
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Invalid request data');
  });
});

// ─── 9.4: ErrorLogger ────────────────────────────────────────────────────────

describe('9.4 ErrorLogger', () => {
  let spyError;
  let spyWarn;

  // We need to spy on the winston logger that errorLogger creates internally.
  // Since errorLogger exports a `log` function that calls logger.error/warn,
  // we test behavior by observing what gets logged via a spy on the module.
  // We'll use a mock req and verify the log function routes correctly.

  const mockReq = {
    method: 'GET',
    url: '/api/test',
    headers: { 'x-request-id': 'req-123' },
  };

  beforeEach(() => {
    // Spy on console output since winston writes to Console transport
    spyError = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    spyWarn = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    spyError.mockRestore();
    spyWarn.mockRestore();
  });

  it('calls logger.error for errors with statusCode >= 500 and includes stack', () => {
    // We test the routing logic by creating a spy logger approach:
    // Verify that the log function doesn't throw and handles 5xx correctly
    const err = Object.assign(new Error('server failure'), {
      statusCode: 500,
      code: 'INTERNAL_ERROR',
    });

    // Should not throw
    expect(() => errorLogger.log(err, mockReq)).not.toThrow();

    // Verify stdout was written (winston Console transport writes to stdout)
    const written = spyError.mock.calls.map((c) => c[0]).join('');
    const parsed = JSON.parse(written);
    expect(parsed.level).toBe('error');
    expect(parsed.code).toBe('INTERNAL_ERROR');
    expect(parsed.message).toBe('server failure');
    expect(parsed.stack).toBeDefined();
    expect(parsed.method).toBe('GET');
    expect(parsed.url).toBe('/api/test');
    expect(parsed.requestId).toBe('req-123');
  });

  it('calls logger.warn for errors with statusCode < 500 and excludes stack', () => {
    const err = Object.assign(new Error('not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });

    expect(() => errorLogger.log(err, mockReq)).not.toThrow();

    const written = spyError.mock.calls.map((c) => c[0]).join('');
    const parsed = JSON.parse(written);
    expect(parsed.level).toBe('warn');
    expect(parsed.code).toBe('NOT_FOUND');
    expect(parsed.message).toBe('not found');
    expect(parsed.stack).toBeUndefined();
    expect(parsed.method).toBe('GET');
    expect(parsed.url).toBe('/api/test');
    expect(parsed.requestId).toBe('req-123');
  });

  it('includes correct fields for 5xx: code, message, stack, method, url, requestId', () => {
    const err = Object.assign(new Error('db error'), {
      statusCode: 503,
      code: 'INTERNAL_ERROR',
    });

    errorLogger.log(err, mockReq);

    const written = spyError.mock.calls.map((c) => c[0]).join('');
    const parsed = JSON.parse(written);
    expect(parsed).toHaveProperty('code');
    expect(parsed).toHaveProperty('message');
    expect(parsed).toHaveProperty('stack');
    expect(parsed).toHaveProperty('method');
    expect(parsed).toHaveProperty('url');
    expect(parsed).toHaveProperty('requestId');
  });

  it('includes correct fields for 4xx: code, message, method, url, requestId (no stack)', () => {
    const err = Object.assign(new Error('bad input'), {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });

    errorLogger.log(err, mockReq);

    const written = spyError.mock.calls.map((c) => c[0]).join('');
    const parsed = JSON.parse(written);
    expect(parsed).toHaveProperty('code');
    expect(parsed).toHaveProperty('message');
    expect(parsed).not.toHaveProperty('stack');
    expect(parsed).toHaveProperty('method');
    expect(parsed).toHaveProperty('url');
    expect(parsed).toHaveProperty('requestId');
  });
});

// ─── 9.5: escrowController unit tests ────────────────────────────────────────

describe('9.5 escrowController', () => {
  function makeReq(params = {}, body = {}) {
    return { params, body, query: {}, headers: {} };
  }

  function makeRes() {
    return {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getEscrow throws NotFoundError when prisma.escrow.findUnique returns null', async () => {
    prismaMock.escrow.findUnique.mockResolvedValue(null);

    const req = makeReq({ id: '42' });
    const res = makeRes();
    const next = jest.fn();

    await escrowController.getEscrow(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('getEscrow throws ValidationError when ID cannot be converted to BigInt', async () => {
    const req = makeReq({ id: 'abc' });
    const res = makeRes();
    const next = jest.fn();

    await escrowController.getEscrow(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('getMilestone throws NotFoundError when milestone not found', async () => {
    prismaMock.milestone.findUnique.mockResolvedValue(null);

    const req = makeReq({ id: '1', milestoneId: '0' });
    const res = makeRes();
    const next = jest.fn();

    await escrowController.getMilestone(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('broadcastCreateEscrow throws ValidationError when signedXdr is missing', async () => {
    const req = { params: {}, body: {}, query: {}, headers: {} };
    const res = makeRes();
    const next = jest.fn();

    await escrowController.broadcastCreateEscrow(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(ValidationError));
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});

// ─── 9.6: Supertest integration tests ────────────────────────────────────────

describe('9.6 Integration tests', () => {
  let request;
  let testApp;

  beforeAll(async () => {
    const supertest = await import('supertest');
    request = supertest.default;

    // Build a minimal Express app that mirrors the relevant parts of server.js
    // without starting an HTTP server or requiring stripe/websockets.
    const express = (await import('express')).default;
    const { default: escrowRoutes } = await import('../api/routes/escrowRoutes.js');
    const { default: errHandler } = await import('../middleware/errorHandler.js');
    const { NotFoundError: NFE } = await import('../lib/errors.js');

    testApp = express();
    testApp.use(express.json());
    testApp.use('/api/escrows', escrowRoutes);

    // 404 catch-all
    testApp.use((_req, _res, next) => next(new NFE('Route not found')));

    // Global error handler
    testApp.use(errHandler);
  });

  it('GET /nonexistent-route → HTTP 404 with code "NOT_FOUND"', async () => {
    const res = await request(testApp).get('/nonexistent-route');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /api/escrows/not-a-valid-id → HTTP 400 with code "VALIDATION_ERROR"', async () => {
    const res = await request(testApp).get('/api/escrows/not-a-valid-id');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
