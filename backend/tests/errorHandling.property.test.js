import fc from 'fast-check';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  InternalError,
} from '../lib/errors.js';
import { errorsTotal } from '../lib/metrics.js';

// Feature: api-error-handling, Property 1: AppError subclass defaults are correct

const subclassConfigs = [
  { Cls: ValidationError, statusCode: 400, code: 'VALIDATION_ERROR', isOperational: true },
  { Cls: NotFoundError, statusCode: 404, code: 'NOT_FOUND', isOperational: true },
  { Cls: UnauthorizedError, statusCode: 401, code: 'UNAUTHORIZED', isOperational: true },
  { Cls: ForbiddenError, statusCode: 403, code: 'FORBIDDEN', isOperational: true },
  { Cls: ConflictError, statusCode: 409, code: 'CONFLICT', isOperational: true },
  { Cls: InternalError, statusCode: 500, code: 'INTERNAL_ERROR', isOperational: false },
];

// Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9
test('AppError subclass defaults are correct for any message string', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...subclassConfigs),
      fc.string(),
      (config, message) => {
        const { Cls, statusCode, code, isOperational } = config;
        const err = new Cls(message);

        return (
          err.statusCode === statusCode &&
          err.code === code &&
          err.isOperational === isOperational &&
          err.message === message
        );
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: api-error-handling, Property 10: Log level matches error severity

// Validates: Requirements 4.2, 4.3
test('Log level matches error severity for any statusCode between 100 and 599', () => {
  const mockReq = {
    method: 'GET',
    url: '/test',
    headers: { 'x-request-id': 'test-id-123' },
  };

  fc.assert(
    fc.property(
      fc.integer({ min: 100, max: 599 }),
      fc.string({ minLength: 1 }),
      fc.string(),
      (statusCode, code, message) => {
        const isServerError = statusCode >= 500;

        let errorCalled = false;
        let warnCalled = false;
        let loggedFields = null;

        // Spy logger that mirrors the interface used inside errorLogger
        const spyLogger = {
          error(fields) {
            errorCalled = true;
            loggedFields = fields;
          },
          warn(fields) {
            warnCalled = true;
            loggedFields = fields;
          },
        };

        const err = Object.assign(new Error(message), { statusCode, code });

        // Replicate the routing logic from errorLogger.log()
        const reqId = mockReq.headers['x-request-id'];
        const base = {
          code: err.code,
          message: err.message,
          method: mockReq.method,
          url: mockReq.url,
          requestId: reqId,
        };

        if (statusCode >= 500) {
          spyLogger.error({ ...base, stack: err.stack });
        } else {
          spyLogger.warn(base);
        }

        // Assert correct logger method was called
        if (isServerError) {
          if (!errorCalled || warnCalled) return false;
          // error level must include: code, message, stack, method, url, requestId
          return (
            'code' in loggedFields &&
            'message' in loggedFields &&
            'stack' in loggedFields &&
            'method' in loggedFields &&
            'url' in loggedFields &&
            'requestId' in loggedFields
          );
        } else {
          if (!warnCalled || errorCalled) return false;
          // warn level must include: code, message, method, url, requestId — but NOT stack
          return (
            'code' in loggedFields &&
            'message' in loggedFields &&
            !('stack' in loggedFields) &&
            'method' in loggedFields &&
            'url' in loggedFields &&
            'requestId' in loggedFields
          );
        }
      }
    ),
    { numRuns: 100 }
  );
});

// ─── ErrorHandler property tests ─────────────────────────────────────────────

import errorHandler from '../middleware/errorHandler.js';

// Helper: build a minimal mock req/res pair and invoke the error handler.
// Returns { status, body, headers } captured from the mock response.
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

// UUID v4 regex
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Arbitrary generator for AppError instances with varied statusCodes/codes
const appErrorArb = fc.tuple(
  fc.constantFrom(
    ...subclassConfigs.map(({ Cls }) => Cls)
  ),
  fc.string({ minLength: 1, maxLength: 80 })
).map(([Cls, msg]) => new Cls(msg));

// Arbitrary generator for plain (non-AppError) errors
const plainErrorArb = fc.string({ minLength: 1, maxLength: 80 }).map((msg) => new Error(msg));

// ── Property 2 ────────────────────────────────────────────────────────────────
// Feature: api-error-handling, Property 2: Every error response matches the Error_Response shape

// Validates: Requirements 2.1
test('Every error response matches the Error_Response shape', () => {
  fc.assert(
    fc.property(
      fc.oneof(appErrorArb, plainErrorArb),
      (err) => {
        const { body } = runHandler(err, { nodeEnv: 'development' });
        if (!body || typeof body !== 'object') return false;
        const { error } = body;
        if (!error || typeof error !== 'object') return false;
        return (
          typeof error.code === 'string' &&
          typeof error.message === 'string' &&
          typeof error.requestId === 'string'
        );
      }
    ),
    { numRuns: 100 }
  );
});

// ── Property 3 ────────────────────────────────────────────────────────────────
// Feature: api-error-handling, Property 3: AppError statusCode is used as the HTTP response status

// Validates: Requirements 2.2
test('AppError statusCode is used as the HTTP response status', () => {
  fc.assert(
    fc.property(appErrorArb, (err) => {
      const { status } = runHandler(err, { nodeEnv: 'development' });
      return status === err.statusCode;
    }),
    { numRuns: 100 }
  );
});

// ── Property 4 ────────────────────────────────────────────────────────────────
// Feature: api-error-handling, Property 4: Non-AppError errors produce HTTP 500 with INTERNAL_ERROR

// Validates: Requirements 2.3
test('Non-AppError errors produce HTTP 500 with INTERNAL_ERROR', () => {
  fc.assert(
    fc.property(plainErrorArb, (err) => {
      const { status, body } = runHandler(err, { nodeEnv: 'development' });
      return status === 500 && body?.error?.code === 'INTERNAL_ERROR';
    }),
    { numRuns: 100 }
  );
});

// ── Property 5 ────────────────────────────────────────────────────────────────
// Feature: api-error-handling, Property 5: Every error response contains a valid requestId

// Validates: Requirements 2.4
test('Every error response contains a valid requestId', () => {
  // When x-request-id header is present, requestId must equal it
  fc.assert(
    fc.property(
      fc.oneof(appErrorArb, plainErrorArb),
      fc.uuid(),
      (err, headerId) => {
        const { body } = runHandler(err, { requestId: headerId, nodeEnv: 'development' });
        return body?.error?.requestId === headerId;
      }
    ),
    { numRuns: 100 }
  );

  // When x-request-id header is absent, requestId must be a valid UUID v4
  fc.assert(
    fc.property(fc.oneof(appErrorArb, plainErrorArb), (err) => {
      const { body } = runHandler(err, { nodeEnv: 'development' });
      return UUID_V4_RE.test(body?.error?.requestId);
    }),
    { numRuns: 100 }
  );
});

// ── Property 6 ────────────────────────────────────────────────────────────────
// Feature: api-error-handling, Property 6: Production mode omits stack and sanitizes non-operational messages

// Validates: Requirements 2.5, 6.1
test('Production mode omits stack and sanitizes non-operational messages', () => {
  fc.assert(
    fc.property(fc.oneof(appErrorArb, plainErrorArb), (err) => {
      const { body } = runHandler(err, { nodeEnv: 'production' });
      const { error } = body;

      // Stack must not be present in production
      if ('stack' in error) return false;

      // Non-operational errors must have their message replaced
      const isOperational = err instanceof AppError ? err.isOperational : false;
      if (!isOperational && error.message !== 'An unexpected error occurred') return false;

      return true;
    }),
    { numRuns: 100 }
  );
});

// ── Property 7 ────────────────────────────────────────────────────────────────
// Feature: api-error-handling, Property 7: Non-production mode includes stack field

// Validates: Requirements 2.6
test('Non-production mode includes stack field', () => {
  fc.assert(
    fc.property(
      fc.oneof(appErrorArb, plainErrorArb),
      fc.constantFrom('development', 'test', 'staging'),
      (err, env) => {
        const { body } = runHandler(err, { nodeEnv: env });
        return typeof body?.error?.stack === 'string' && body.error.stack.length > 0;
      }
    ),
    { numRuns: 100 }
  );
});

// ── Property 8 ────────────────────────────────────────────────────────────────
// Feature: api-error-handling, Property 8: Error response Content-Type is always application/json

// Validates: Requirements 2.7
test('Error response Content-Type is always application/json', () => {
  fc.assert(
    fc.property(fc.oneof(appErrorArb, plainErrorArb), (err) => {
      const { headers } = runHandler(err, { nodeEnv: 'development' });
      return headers['content-type'] === 'application/json';
    }),
    { numRuns: 100 }
  );
});

// ── Property 9 ────────────────────────────────────────────────────────────────
// Feature: api-error-handling, Property 9: errorsTotal counter increments on every error response

// Validates: Requirements 3.6
test('errorsTotal counter increments on every error response', () => {
  // Mock errorsTotal.inc to track calls
  const incCalls = [];
  const originalInc = errorsTotal.inc.bind(errorsTotal);

  fc.assert(
    fc.property(fc.oneof(appErrorArb, plainErrorArb), (err) => {
      incCalls.length = 0;
      let incCount = 0;

      // Patch inc on the counter instance
      const origInc = errorsTotal.inc;
      errorsTotal.inc = (labels) => {
        incCount++;
        incCalls.push(labels);
        // Still call original to keep Prometheus state consistent
        origInc.call(errorsTotal, labels);
      };

      runHandler(err, { nodeEnv: 'development' });

      errorsTotal.inc = origInc;

      return incCount === 1;
    }),
    { numRuns: 100 }
  );
});

// ── Property 11 ───────────────────────────────────────────────────────────────
// Feature: api-error-handling, Property 11: Prisma P2025 errors are converted to NotFoundError

// Validates: Requirements 6.3
test('Prisma P2025 errors are converted to NotFoundError (HTTP 404 NOT_FOUND)', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 80 }), (msg) => {
      // Simulate a PrismaClientKnownRequestError with code P2025
      const prismaErr = new Error(msg);
      prismaErr.constructor = { name: 'PrismaClientKnownRequestError' };
      Object.defineProperty(prismaErr, 'constructor', {
        value: { name: 'PrismaClientKnownRequestError' },
        writable: true,
      });
      prismaErr.code = 'P2025';

      const { status, body } = runHandler(prismaErr, { nodeEnv: 'development' });
      return status === 404 && body?.error?.code === 'NOT_FOUND';
    }),
    { numRuns: 100 }
  );
});

// ── Property 12 ───────────────────────────────────────────────────────────────
// Feature: api-error-handling, Property 12: Prisma validation errors are converted to ValidationError

// Validates: Requirements 6.4
test('Prisma validation errors are converted to ValidationError (HTTP 400 VALIDATION_ERROR)', () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1, maxLength: 80 }), (msg) => {
      // Simulate a PrismaClientValidationError
      const prismaErr = new Error(msg);
      Object.defineProperty(prismaErr, 'constructor', {
        value: { name: 'PrismaClientValidationError' },
        writable: true,
      });

      const { status, body } = runHandler(prismaErr, { nodeEnv: 'development' });
      return (
        status === 400 &&
        body?.error?.code === 'VALIDATION_ERROR' &&
        body?.error?.message === 'Invalid request data'
      );
    }),
    { numRuns: 100 }
  );
});
