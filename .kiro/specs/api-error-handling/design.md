# Design Document: API Error Handling

## Overview

This design introduces a centralized, consistent error handling system to the Express backend. The current codebase scatters error responses across controllers — each one calling `res.status(N).json({ error: err.message })` directly, with no standard shape, no structured logging, and no protection against leaking internal details to clients.

The solution has four parts:

1. A custom error class hierarchy (`AppError` and subclasses) that carries semantic meaning and HTTP status codes.
2. A global Express error handler middleware that produces a uniform `Error_Response` JSON envelope.
3. A Winston-based `ErrorLogger` that writes structured log entries server-side without leaking sensitive data.
4. Migration of all existing controllers to throw the new error classes instead of constructing inline responses.

The design integrates with the existing Sentry setup, Prometheus `errorsTotal` counter, and the `x-request-id` header convention already present in the codebase.

---

## Architecture

```mermaid
flowchart TD
    Client -->|HTTP Request| Express
    Express --> Routes
    Routes --> Controllers
    Controllers -->|throw AppError| ErrorHandler
    Controllers -->|next(err)| ErrorHandler
    Middleware -->|next(err)| ErrorHandler
    Express -->|unmatched route| NotFoundMiddleware
    NotFoundMiddleware -->|next(NotFoundError)| ErrorHandler
    ErrorHandler --> ErrorLogger
    ErrorHandler --> Prometheus[errorsTotal counter]
    ErrorHandler --> SentryHandler[Sentry expressErrorHandler]
    ErrorHandler -->|Error_Response JSON| Client

    subgraph Error Classes
        AppError --> ValidationError
        AppError --> NotFoundError
        AppError --> UnauthorizedError
        AppError --> ForbiddenError
        AppError --> ConflictError
        AppError --> InternalError
    end
```

### Middleware Registration Order in `server.js`

```
Sentry.expressRequestHandler()
helmet / cors / morgan / body parsers / audit
Sentry.expressTracingHandler()
Rate limiters
Route handlers
404 catch-all  →  next(new NotFoundError())
Sentry.expressErrorHandler()
ErrorHandler   ← new global error handler (last)
```

The `ErrorHandler` is registered **after** `Sentry.expressErrorHandler()` so Sentry captures the raw error before the handler normalizes it for the client response.

---

## Components and Interfaces

### 1. `backend/lib/errors.js` — Error Class Hierarchy

```js
// AppError — base class
class AppError extends Error {
  constructor(message, statusCode, code, isOperational = true)
  // properties: message, statusCode, code, isOperational, stack
}

// Subclasses (all isOperational = true except InternalError)
class ValidationError  extends AppError  // 400, "VALIDATION_ERROR"
class NotFoundError    extends AppError  // 404, "NOT_FOUND"
class UnauthorizedError extends AppError // 401, "UNAUTHORIZED"
class ForbiddenError   extends AppError  // 403, "FORBIDDEN"
class ConflictError    extends AppError  // 409, "CONFLICT"
class InternalError    extends AppError  // 500, "INTERNAL_ERROR", isOperational=false
```

### 2. `backend/lib/errorLogger.js` — Structured Winston Logger

```js
// Creates a dedicated Winston logger that writes JSON to stdout/file.
// Reads LOG_LEVEL from environment (default: "info").
//
// log(err, req)
//   - statusCode >= 500  → logger.error({ timestamp, code, message, stack, method, url, requestId })
//   - statusCode < 500   → logger.warn({ timestamp, code, message, method, url, requestId })
//   - Never logs: raw DB queries, passwords, secret keys, connection strings
```

### 3. `backend/middleware/errorHandler.js` — Global Express Error Middleware

Four-argument Express error handler `(err, req, res, next)`:

```
1. Normalize Prisma errors → AppError subclasses
2. Derive requestId from req.headers['x-request-id'] or generate UUID
3. Determine statusCode and code from error type
4. Sanitize message (strip file paths; replace non-operational message in production)
5. Call ErrorLogger.log(err, req)
6. Increment errorsTotal Prometheus counter
7. Build and send Error_Response
```

**Prisma normalization:**
- `PrismaClientKnownRequestError` with code `P2025` → `NotFoundError`
- `PrismaClientValidationError` → `ValidationError("Invalid request data")`

**Response shape:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Escrow not found",
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

In non-production, a `stack` field is appended to the `error` object.

### 4. Controller Updates

All controllers in `backend/api/controllers/` are updated to:
- Replace `res.status(404).json(...)` with `throw new NotFoundError(message)`
- Replace `res.status(400).json(...)` with `throw new ValidationError(message)`
- Replace `res.status(403).json(...)` with `throw new ForbiddenError(message)`
- Replace `res.status(500).json(...)` with `next(err)` (or let the error propagate naturally)
- Replace BigInt conversion string-checks with `throw new ValidationError(...)`
- Wrap async handlers so thrown errors reach `next(err)` — either via try/catch calling `next(err)` or a shared `asyncHandler` wrapper

### 5. `backend/lib/asyncHandler.js` — Optional Async Wrapper

```js
// Wraps an async route handler so any thrown error is forwarded to next(err)
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
```

---

## Data Models

### Error_Response (wire format)

```typescript
interface ErrorResponse {
  error: {
    code: string;       // machine-readable, e.g. "NOT_FOUND"
    message: string;    // human-readable; sanitized in production
    requestId: string;  // UUID, from x-request-id header or generated
    stack?: string;     // only present in non-production environments
  };
}
```

### AppError (in-memory)

```typescript
class AppError extends Error {
  statusCode: number;   // HTTP status code
  code: string;         // machine-readable error code
  isOperational: boolean; // true = expected error; false = programmer mistake
}
```

### ErrorLogEntry (Winston JSON log line)

```typescript
// For statusCode >= 500 (error level):
interface ErrorLogEntry {
  level: "error" | "warn";
  timestamp: string;    // ISO 8601
  code: string;
  message: string;
  stack?: string;       // only for error level
  method: string;       // HTTP method
  url: string;
  requestId: string;
}
```

### Prisma Error Mapping

| Prisma Error | Mapped To | Notes |
|---|---|---|
| `PrismaClientKnownRequestError` P2025 | `NotFoundError` | Record not found |
| `PrismaClientValidationError` | `ValidationError("Invalid request data")` | Bad query shape |
| Other Prisma errors | `InternalError` (via `next(err)`) | Unexpected DB failure |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: AppError subclass defaults are correct

*For any* AppError subclass (`ValidationError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `InternalError`) instantiated with any message string, the instance must have the correct default `statusCode`, `code`, and `isOperational` values as specified, and the `message` property must equal the string passed to the constructor.

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9**

### Property 2: Every error response matches the Error_Response shape

*For any* error passed to the ErrorHandler, the response body must be a JSON object with an `error` key containing exactly the fields `code` (string), `message` (string), and `requestId` (string).

**Validates: Requirements 2.1**

### Property 3: AppError statusCode is used as the HTTP response status

*For any* AppError instance, the HTTP status code in the response must equal the `statusCode` property of that error.

**Validates: Requirements 2.2**

### Property 4: Non-AppError errors produce HTTP 500 with INTERNAL_ERROR

*For any* error that is not an instance of AppError, the ErrorHandler must respond with HTTP status 500 and `code` equal to `"INTERNAL_ERROR"`.

**Validates: Requirements 2.3**

### Property 5: Every error response contains a valid requestId

*For any* error response, the `error.requestId` field must be a non-empty string. When the `x-request-id` request header is present, `requestId` must equal that header value; when absent, `requestId` must be a valid UUID v4.

**Validates: Requirements 2.4**

### Property 6: Production mode omits stack and sanitizes non-operational messages

*For any* error response produced when `NODE_ENV=production`, the response body must not contain a `stack` field. Additionally, for any non-operational error (`isOperational === false`), the `message` field must equal `"An unexpected error occurred"`.

**Validates: Requirements 2.5, 6.1**

### Property 7: Non-production mode includes stack field

*For any* error response produced when `NODE_ENV` is not `"production"`, the `error` object in the response body must include a `stack` field that is a non-empty string.

**Validates: Requirements 2.6**

### Property 8: Error response Content-Type is always application/json

*For any* error that passes through the ErrorHandler, the `Content-Type` response header must be `application/json`.

**Validates: Requirements 2.7**

### Property 9: errorsTotal counter increments on every error response

*For any* error that passes through the ErrorHandler, the Prometheus `errorsTotal` counter must be incremented exactly once, labeled with the error's type and the request route.

**Validates: Requirements 3.6**

### Property 10: Log level matches error severity

*For any* error with `statusCode >= 500`, the ErrorLogger must emit a log entry at the `error` level containing `timestamp`, `code`, `message`, `stack`, `method`, `url`, and `requestId`. *For any* error with `statusCode < 500`, the ErrorLogger must emit a log entry at the `warn` level containing `timestamp`, `code`, `message`, `method`, `url`, and `requestId`.

**Validates: Requirements 4.2, 4.3**

### Property 11: Prisma P2025 errors are converted to NotFoundError

*For any* `PrismaClientKnownRequestError` with code `P2025`, the ErrorHandler must produce an HTTP 404 response with `code` equal to `"NOT_FOUND"`.

**Validates: Requirements 6.3**

### Property 12: Prisma validation errors are converted to ValidationError

*For any* `PrismaClientValidationError`, the ErrorHandler must produce an HTTP 400 response with `code` equal to `"VALIDATION_ERROR"` and `message` equal to `"Invalid request data"`.

**Validates: Requirements 6.4**

### Property 13: File system paths are stripped from error messages

*For any* error whose message contains a file system path pattern (e.g., `/home/`, `/usr/`, `C:\`, `node_modules/`), the `message` field in the Error_Response must not contain that path substring.

**Validates: Requirements 6.5**

### Property 14: Invalid ID strings produce ValidationError in controllers

*For any* request to a controller endpoint with an ID parameter that cannot be converted to a BigInt, the controller must throw a `ValidationError` (resulting in HTTP 400 with `code` `"VALIDATION_ERROR"`), rather than propagating a raw conversion error.

**Validates: Requirements 5.5**

---

## Error Handling

### Process-Level Errors

```js
// In server.js, after the ErrorHandler is registered:
process.on('unhandledRejection', (reason) => {
  errorLogger.log(reason instanceof Error ? reason : new InternalError(String(reason)), null);
  // Do not exit — let the process continue serving requests
});

process.on('uncaughtException', (err) => {
  errorLogger.log(err, null);
  process.exit(1); // Uncaught exceptions leave the process in an undefined state
});
```

### Sensitive Data Sanitization

The ErrorHandler applies these sanitization steps before building the response:

1. **File path stripping**: regex replaces patterns like `/home/user/project/...` or `C:\Users\...` with `[path]`.
2. **Non-operational message replacement**: in production, if `err.isOperational === false`, replace `message` with `"An unexpected error occurred"`.
3. **Prisma object exclusion**: the raw Prisma error object is never serialized into the response; only the normalized `AppError` fields are used.

### Controller Error Flow

Controllers no longer need try/catch for every handler. The recommended pattern is:

```js
// Option A: explicit try/catch forwarding to next
const getEscrow = async (req, res, next) => {
  try {
    const id = parseId(req.params.id); // throws ValidationError on bad input
    const escrow = await prisma.escrow.findUnique({ where: { id } });
    if (!escrow) throw new NotFoundError('Escrow not found');
    res.json(escrow);
  } catch (err) {
    next(err);
  }
};

// Option B: asyncHandler wrapper (eliminates boilerplate)
const getEscrow = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id);
  const escrow = await prisma.escrow.findUnique({ where: { id } });
  if (!escrow) throw new NotFoundError('Escrow not found');
  res.json(escrow);
});
```

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. They are complementary:

- **Unit tests** verify specific examples, integration points, and edge cases.
- **Property tests** verify universal invariants across many generated inputs.

### Unit Tests

Located in `backend/tests/errorHandling.test.js`:

- Each `AppError` subclass instantiates with correct `statusCode`, `code`, and `isOperational`.
- `ErrorHandler` returns the correct HTTP status and JSON shape for each error type.
- `ErrorHandler` converts `PrismaClientKnownRequestError` P2025 → 404.
- `ErrorHandler` converts `PrismaClientValidationError` → 400 with `"Invalid request data"`.
- `ErrorHandler` omits `stack` in production, includes it in development.
- `ErrorHandler` replaces non-operational error messages in production.
- `ErrorLogger` calls `logger.error` for 5xx and `logger.warn` for 4xx.
- `escrowController` throws `NotFoundError` when escrow is not found.
- `escrowController` throws `ValidationError` when BigInt conversion fails.

### Property-Based Tests

Located in `backend/tests/errorHandling.property.test.js`.

Property-based testing library: **[fast-check](https://github.com/dubzzz/fast-check)** (already compatible with the Jest setup in `backend/jest.config.js`).

Each property test runs a minimum of **100 iterations**.

Each test is tagged with a comment in the format:
`// Feature: api-error-handling, Property N: <property_text>`

| Property | Test Description |
|---|---|
| Property 1 | For any AppError subclass, defaults (statusCode, code, isOperational, message) are correct |
| Property 2 | For any error, response body matches Error_Response shape |
| Property 3 | For any AppError, statusCode in response equals error.statusCode |
| Property 4 | For any non-AppError, response is 500 with INTERNAL_ERROR |
| Property 5 | For any error, response contains a valid requestId |
| Property 6 | For any error in production, no stack field; non-operational message is replaced |
| Property 7 | For any error in non-production, stack field is present |
| Property 8 | For any error, Content-Type is application/json |
| Property 9 | For any error, errorsTotal counter increments by exactly 1 |
| Property 10 | For any error, log level matches statusCode threshold with correct fields |
| Property 11 | For any P2025 Prisma error, response is 404 NOT_FOUND |
| Property 12 | For any PrismaClientValidationError, response is 400 VALIDATION_ERROR |
| Property 13 | For any error message with a file path, sanitized message contains no path |
| Property 14 | For any invalid ID string, controller throws ValidationError (HTTP 400) |

**Example property test skeleton:**

```js
import fc from 'fast-check';

// Feature: api-error-handling, Property 1: AppError subclass status codes are preserved
test('AppError subclass statusCode is used as HTTP response status', () => {
  fc.assert(
    fc.property(
      fc.constantFrom(
        new ValidationError('bad input'),
        new NotFoundError('not found'),
        new UnauthorizedError('no auth'),
        new ForbiddenError('no permission'),
        new ConflictError('duplicate'),
      ),
      (err) => {
        const res = simulateErrorHandler(err);
        return res.status === err.statusCode;
      }
    ),
    { numRuns: 100 }
  );
});
```

### Integration Tests

- Supertest integration tests verify end-to-end error responses from actual Express routes.
- Cover: 404 on unknown route, 400 on invalid escrow ID, 500 on simulated DB failure.
