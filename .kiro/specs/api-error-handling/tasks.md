# Implementation Plan: API Error Handling

## Overview

Introduce a centralized error handling system to the Express backend: a custom error class hierarchy, a global error handler middleware, a structured Winston error logger, an async handler utility, and migration of all existing controllers to use the new error classes.

## Tasks

- [x] 1. Create the error class hierarchy in `backend/lib/errors.js`
  - Implement `AppError` extending native `Error` with `statusCode`, `code`, `message`, and `isOperational` properties
  - Implement `ValidationError` (400, `"VALIDATION_ERROR"`, `isOperational=true`)
  - Implement `NotFoundError` (404, `"NOT_FOUND"`, `isOperational=true`)
  - Implement `UnauthorizedError` (401, `"UNAUTHORIZED"`, `isOperational=true`)
  - Implement `ForbiddenError` (403, `"FORBIDDEN"`, `isOperational=true`)
  - Implement `ConflictError` (409, `"CONFLICT"`, `isOperational=true`)
  - Implement `InternalError` (500, `"INTERNAL_ERROR"`, `isOperational=false`)
  - Export all classes as named exports
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [x] 1.1 Write property test for AppError subclass defaults
    - **Property 1: AppError subclass defaults are correct**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9**
    - Use `fast-check` with `fc.constantFrom` over all subclasses and arbitrary message strings
    - Assert correct `statusCode`, `code`, `isOperational`, and `message` for each
    - Tag: `// Feature: api-error-handling, Property 1: AppError subclass defaults are correct`
    - File: `backend/tests/errorHandling.property.test.js`

- [x] 2. Create the async handler utility in `backend/lib/asyncHandler.js`
  - Implement `asyncHandler(fn)` that wraps an async route handler and forwards any thrown error to `next(err)`
  - Export as default
  - _Requirements: 5.3_

- [x] 3. Create the error logger in `backend/lib/errorLogger.js`
  - Use the existing `winston` dependency to create a dedicated JSON logger
  - Read `LOG_LEVEL` from environment (default `"info"`)
  - Implement `log(err, req)`:
    - `statusCode >= 500` → `logger.error` with `{ timestamp, code, message, stack, method, url, requestId }`
    - `statusCode < 500` → `logger.warn` with `{ timestamp, code, message, method, url, requestId }`
    - Never log raw DB queries, passwords, or secret keys
  - Export as default instance
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 3.1 Write property test for log level matching error severity
    - **Property 10: Log level matches error severity**
    - **Validates: Requirements 4.2, 4.3**
    - Use `fast-check` to generate errors with arbitrary `statusCode` values
    - Assert `logger.error` called for `statusCode >= 500`, `logger.warn` for `statusCode < 500`
    - Assert correct fields present at each level
    - Tag: `// Feature: api-error-handling, Property 10: Log level matches error severity`
    - File: `backend/tests/errorHandling.property.test.js`

- [x] 4. Create the global error handler middleware in `backend/middleware/errorHandler.js`
  - Implement four-argument Express error handler `(err, req, res, next)`
  - Normalize Prisma errors: `PrismaClientKnownRequestError` P2025 → `NotFoundError`; `PrismaClientValidationError` → `ValidationError("Invalid request data")`; other Prisma errors pass through as-is
  - Derive `requestId` from `req.headers['x-request-id']` or generate a UUID v4 when absent
  - Sanitize messages: strip file system path patterns; replace non-operational error messages with `"An unexpected error occurred"` in production
  - Call `errorLogger.log(err, req)`
  - Increment the existing `errorsTotal` Prometheus counter with `{ type, route }`
  - Build and send `Error_Response`: `{ error: { code, message, requestId } }` plus `stack` in non-production
  - Set `Content-Type: application/json`
  - Export as default
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.6, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 4.1 Write property test: every error response matches Error_Response shape
    - **Property 2: Every error response matches the Error_Response shape**
    - **Validates: Requirements 2.1**
    - Tag: `// Feature: api-error-handling, Property 2: Every error response matches the Error_Response shape`
    - File: `backend/tests/errorHandling.property.test.js`

  - [x] 4.2 Write property test: AppError statusCode used as HTTP response status
    - **Property 3: AppError statusCode is used as the HTTP response status**
    - **Validates: Requirements 2.2**
    - Tag: `// Feature: api-error-handling, Property 3: AppError statusCode is used as the HTTP response status`
    - File: `backend/tests/errorHandling.property.test.js`

  - [x] 4.3 Write property test: non-AppError produces HTTP 500 INTERNAL_ERROR
    - **Property 4: Non-AppError errors produce HTTP 500 with INTERNAL_ERROR**
    - **Validates: Requirements 2.3**
    - Tag: `// Feature: api-error-handling, Property 4: Non-AppError errors produce HTTP 500 with INTERNAL_ERROR`
    - File: `backend/tests/errorHandling.property.test.js`

  - [x] 4.4 Write property test: every error response contains a valid requestId
    - **Property 5: Every error response contains a valid requestId**
    - **Validates: Requirements 2.4**
    - Assert `requestId` equals `x-request-id` header when present; is a valid UUID v4 when absent
    - Tag: `// Feature: api-error-handling, Property 5: Every error response contains a valid requestId`
    - File: `backend/tests/errorHandling.property.test.js`

  - [x] 4.5 Write property test: production mode omits stack and sanitizes non-operational messages
    - **Property 6: Production mode omits stack and sanitizes non-operational messages**
    - **Validates: Requirements 2.5, 6.1**
    - Tag: `// Feature: api-error-handling, Property 6: Production mode omits stack and sanitizes non-operational messages`
    - File: `backend/tests/errorHandling.property.test.js`

  - [x] 4.6 Write property test: non-production mode includes stack field
    - **Property 7: Non-production mode includes stack field**
    - **Validates: Requirements 2.6**
    - Tag: `// Feature: api-error-handling, Property 7: Non-production mode includes stack field`
    - File: `backend/tests/errorHandling.property.test.js`

  - [x] 4.7 Write property test: Content-Type is always application/json
    - **Property 8: Error response Content-Type is always application/json**
    - **Validates: Requirements 2.7**
    - Tag: `// Feature: api-error-handling, Property 8: Error response Content-Type is always application/json`
    - File: `backend/tests/errorHandling.property.test.js`

  - [x] 4.8 Write property test: errorsTotal counter increments on every error
    - **Property 9: errorsTotal counter increments on every error response**
    - **Validates: Requirements 3.6**
    - Tag: `// Feature: api-error-handling, Property 9: errorsTotal counter increments on every error response`
    - File: `backend/tests/errorHandling.property.test.js`

  - [x] 4.9 Write property test: Prisma P2025 errors convert to NotFoundError
    - **Property 11: Prisma P2025 errors are converted to NotFoundError**
    - **Validates: Requirements 6.3**
    - Tag: `// Feature: api-error-handling, Property 11: Prisma P2025 errors are converted to NotFoundError`
    - File: `backend/tests/errorHandling.property.test.js`

  - [x] 4.10 Write property test: PrismaClientValidationError converts to ValidationError
    - **Property 12: Prisma validation errors are converted to ValidationError**
    - **Validates: Requirements 6.4**
    - Tag: `// Feature: api-error-handling, Property 12: Prisma validation errors are converted to ValidationError`
    - File: `backend/tests/errorHandling.property.test.js`

  - [ ]* 4.11 Write property test: file system paths are stripped from error messages
    - **Property 13: File system paths are stripped from error messages**
    - **Validates: Requirements 6.5**
    - Use `fast-check` to generate messages containing path patterns (`/home/`, `/usr/`, `C:\`, `node_modules/`)
    - Assert sanitized message contains no path substring
    - Tag: `// Feature: api-error-handling, Property 13: File system paths are stripped from error messages`
    - File: `backend/tests/errorHandling.property.test.js`

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Wire the new middleware into `backend/server.js`
  - Replace the existing inline 404 handler with `next(new NotFoundError('Route not found'))`
  - Replace the existing generic error handler with the new `errorHandler` middleware imported from `backend/middleware/errorHandler.js`
  - Register `errorHandler` after `Sentry.expressErrorHandler()` as the last middleware
  - Add `process.on('unhandledRejection', ...)` and `process.on('uncaughtException', ...)` handlers using `errorLogger` as specified in the design
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 7. Migrate `backend/api/controllers/escrowController.js`
  - Import `ValidationError`, `NotFoundError` from `backend/lib/errors.js` and `asyncHandler` from `backend/lib/asyncHandler.js`
  - Replace BigInt conversion try/catch blocks with a `parseId` helper that throws `ValidationError` on failure
  - Replace `res.status(404).json(...)` with `throw new NotFoundError(...)`
  - Replace `res.status(400).json(...)` with `throw new ValidationError(...)`
  - Replace `res.status(500).json(...)` catch blocks with `next(err)` or wrap handlers with `asyncHandler`
  - Apply to: `listEscrows`, `getEscrow`, `broadcastCreateEscrow`, `getMilestones`, `getMilestone`
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 7.1 Write property test: invalid ID strings produce ValidationError
    - **Property 14: Invalid ID strings produce ValidationError in controllers**
    - **Validates: Requirements 5.5**
    - Use `fast-check` to generate strings that cannot be converted to BigInt
    - Assert HTTP 400 with `code` `"VALIDATION_ERROR"` for each
    - Tag: `// Feature: api-error-handling, Property 14: Invalid ID strings produce ValidationError in controllers`
    - File: `backend/tests/errorHandling.property.test.js`

- [x] 8. Migrate remaining controllers
  - [x] 8.1 Migrate `backend/api/controllers/disputeController.js`
    - Replace BigInt conversion string-check (`err.message?.includes('Cannot convert')`) with `parseId` helper throwing `ValidationError`
    - Replace `res.status(404).json(...)` with `throw new NotFoundError(...)`
    - Replace `res.status(500).json(...)` catch blocks with `next(err)` or `asyncHandler`
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [x] 8.2 Migrate `backend/api/controllers/eventController.js`
    - Replace inline BigInt conversion error returns with `throw new ValidationError(...)`
    - Replace `res.status(400).json(...)` with `throw new ValidationError(...)`
    - Replace `res.status(404).json(...)` with `throw new NotFoundError(...)`
    - Replace `res.status(500).json(...)` catch blocks with `next(err)` or `asyncHandler`
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [x] 8.3 Migrate `backend/api/controllers/reputationController.js`
    - Replace `res.status(400).json(...)` with `throw new ValidationError(...)`
    - Replace `res.status(500).json(...)` catch blocks with `next(err)` or `asyncHandler`
    - _Requirements: 5.2, 5.3_

  - [x] 8.4 Migrate `backend/api/controllers/userController.js`
    - Replace `validateAddress` helper's direct `res.status(400).json(...)` call with throwing `ValidationError` (update callers accordingly)
    - Replace `res.status(500).json(...)` catch blocks with `next(err)` or `asyncHandler`
    - _Requirements: 5.2, 5.3_

  - [x] 8.5 Migrate `backend/api/controllers/kycController.js`
    - Replace `res.status(400).json(...)` with `throw new ValidationError(...)`
    - Replace `res.status(401).json(...)` with `throw new UnauthorizedError(...)`
    - Replace `res.status(500).json(...)` catch blocks with `next(err)` or `asyncHandler`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 8.6 Migrate `backend/api/controllers/paymentController.js`
    - Replace `res.status(400).json(...)` with `throw new ValidationError(...)`
    - Replace `res.status(403).json(...)` with `throw new ForbiddenError(...)`
    - Replace `res.status(404).json(...)` with `throw new NotFoundError(...)`
    - Replace ad-hoc status derivation in `refund` with appropriate AppError throws
    - Replace `res.status(500).json(...)` catch blocks with `next(err)` or `asyncHandler`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 8.7 Migrate `backend/api/controllers/adminController.js`
    - Replace `res.status(400).json(...)` with `throw new ValidationError(...)`
    - Replace `res.status(404).json(...)` with `throw new NotFoundError(...)`
    - Replace `res.status(409).json(...)` with `throw new ConflictError(...)`
    - Replace `res.status(500).json(...)` catch blocks with `next(err)` or `asyncHandler`
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 9. Write unit tests in `backend/tests/errorHandling.test.js`
  - [x] 9.1 Write unit tests for AppError subclasses
    - Assert each subclass instantiates with correct `statusCode`, `code`, and `isOperational`
    - Assert custom message is preserved
    - _Requirements: 1.1–1.9_

  - [x] 9.2 Write unit tests for ErrorHandler response shape and status codes
    - Assert correct HTTP status and JSON shape for each AppError subclass
    - Assert HTTP 500 and `"INTERNAL_ERROR"` for plain `Error`
    - Assert `stack` present in development, absent in production
    - Assert non-operational message replaced in production
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.6_

  - [x] 9.3 Write unit tests for Prisma error normalization
    - Assert `PrismaClientKnownRequestError` P2025 → HTTP 404 `"NOT_FOUND"`
    - Assert `PrismaClientValidationError` → HTTP 400 `"VALIDATION_ERROR"` with message `"Invalid request data"`
    - _Requirements: 6.3, 6.4_

  - [x] 9.4 Write unit tests for ErrorLogger
    - Assert `logger.error` called for 5xx errors with correct fields
    - Assert `logger.warn` called for 4xx errors with correct fields
    - _Requirements: 4.2, 4.3_

  - [x] 9.5 Write unit tests for migrated escrowController
    - Assert `NotFoundError` thrown when escrow not found
    - Assert `ValidationError` thrown when BigInt conversion fails
    - _Requirements: 5.4, 5.5_

  - [x] 9.6 Write supertest integration tests
    - Assert HTTP 404 with `"NOT_FOUND"` on unknown route
    - Assert HTTP 400 with `"VALIDATION_ERROR"` on invalid escrow ID
    - Assert HTTP 500 with `"INTERNAL_ERROR"` on simulated DB failure
    - _Requirements: 3.3_

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use `fast-check` (compatible with the existing Jest setup in `backend/jest.config.js`)
- `fast-check` must be added as a dev dependency: `npm install --save-dev fast-check`
- Each property test must run a minimum of 100 iterations (`{ numRuns: 100 }`)
- The `asyncHandler` wrapper (task 2) eliminates repetitive try/catch boilerplate in controllers
