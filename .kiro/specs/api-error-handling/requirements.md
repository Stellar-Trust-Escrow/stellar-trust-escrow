# Requirements Document

## Introduction

This feature adds a centralized, consistent error handling system to the Node.js/Express backend. Currently, controllers handle errors ad-hoc — some return `{ error: err.message }` directly, some check for specific error strings, and there is no standard response envelope. The goal is to introduce custom error classes, a global error handler middleware, structured error logging via Winston, and a uniform JSON error response format across all API endpoints. Sensitive details (stack traces, internal messages) must never reach clients.

## Glossary

- **AppError**: The base custom error class that all domain-specific errors extend. Carries an HTTP status code and an optional machine-readable error code.
- **ErrorHandler**: The Express global error-handling middleware (four-argument signature) registered last in the middleware chain.
- **ErrorLogger**: The Winston-based logging component responsible for recording error details server-side.
- **ValidationError**: An AppError subclass representing malformed or invalid request input (HTTP 400).
- **NotFoundError**: An AppError subclass representing a resource that does not exist (HTTP 404).
- **UnauthorizedError**: An AppError subclass representing a missing or invalid authentication credential (HTTP 401).
- **ForbiddenError**: An AppError subclass representing an authenticated request that lacks permission (HTTP 403).
- **ConflictError**: An AppError subclass representing a state conflict such as a duplicate resource (HTTP 409).
- **InternalError**: An AppError subclass representing an unexpected server-side failure (HTTP 500).
- **Error_Response**: The standardized JSON object returned to clients on any error: `{ "error": { "code": string, "message": string, "requestId": string } }`.
- **Controller**: Any Express route handler in `backend/api/controllers/`.
- **Operational_Error**: An expected, anticipated error (e.g., resource not found) as opposed to a programmer mistake.
- **Non_Operational_Error**: An unexpected error such as an uncaught exception or unhandled promise rejection.

## Requirements

### Requirement 1: Custom Error Class Hierarchy

**User Story:** As a backend developer, I want a structured set of custom error classes, so that I can throw semantically meaningful errors from any layer of the application without constructing ad-hoc response objects.

#### Acceptance Criteria

1. THE AppError SHALL extend the native JavaScript `Error` class and expose `statusCode`, `code`, `message`, and `isOperational` properties.
2. THE ValidationError SHALL extend AppError with a default `statusCode` of 400 and a default `code` of `"VALIDATION_ERROR"`.
3. THE NotFoundError SHALL extend AppError with a default `statusCode` of 404 and a default `code` of `"NOT_FOUND"`.
4. THE UnauthorizedError SHALL extend AppError with a default `statusCode` of 401 and a default `code` of `"UNAUTHORIZED"`.
5. THE ForbiddenError SHALL extend AppError with a default `statusCode` of 403 and a default `code` of `"FORBIDDEN"`.
6. THE ConflictError SHALL extend AppError with a default `statusCode` of 409 and a default `code` of `"CONFLICT"`.
7. THE InternalError SHALL extend AppError with a default `statusCode` of 500 and a default `code` of `"INTERNAL_ERROR"`.
8. WHEN an AppError subclass is instantiated with a custom message, THE AppError SHALL preserve that message in the `message` property.
9. THE AppError SHALL set `isOperational` to `true` for all subclasses except InternalError, which SHALL default to `false`.

### Requirement 2: Standardized Error Response Format

**User Story:** As an API consumer, I want every error response to follow the same JSON structure, so that I can write a single error-handling path in my client code.

#### Acceptance Criteria

1. WHEN any error is returned to a client, THE ErrorHandler SHALL respond with a JSON body matching the shape `{ "error": { "code": string, "message": string, "requestId": string } }`.
2. WHEN the error is an AppError, THE ErrorHandler SHALL use the AppError's `statusCode` as the HTTP response status.
3. WHEN the error is not an AppError, THE ErrorHandler SHALL respond with HTTP status 500 and `code` `"INTERNAL_ERROR"`.
4. THE ErrorHandler SHALL include a `requestId` field in every Error_Response, derived from the `x-request-id` request header or a generated UUID when the header is absent.
5. IF the application is running in production mode, THEN THE ErrorHandler SHALL omit stack traces and internal error details from the Error_Response.
6. IF the application is running in non-production mode, THEN THE ErrorHandler SHALL include a `stack` field in the Error_Response to aid debugging.
7. THE ErrorHandler SHALL set the `Content-Type` response header to `application/json` for all error responses.

### Requirement 3: Global Error Handler Middleware

**User Story:** As a backend developer, I want a single, centralized error handler registered in Express, so that no unhandled error can crash the server or return an inconsistent response.

#### Acceptance Criteria

1. THE ErrorHandler SHALL be registered as the last middleware in `backend/server.js`, after all routes and the Sentry error handler.
2. WHEN an error is passed to `next(err)` from any Controller or middleware, THE ErrorHandler SHALL intercept it and produce an Error_Response.
3. WHEN a request is made to a route that does not exist, THE ErrorHandler SHALL respond with HTTP 404 and `code` `"NOT_FOUND"`.
4. WHEN an unhandled promise rejection occurs at the process level, THE ErrorHandler SHALL log the error via the ErrorLogger and prevent the process from terminating silently.
5. WHEN an uncaught exception occurs at the process level, THE ErrorHandler SHALL log the error via the ErrorLogger before the process exits.
6. THE ErrorHandler SHALL increment the existing Prometheus `errorsTotal` counter with the error type and route on every error response.

### Requirement 4: Error Logging

**User Story:** As an operator, I want all server-side errors to be logged with sufficient context, so that I can diagnose issues without exposing sensitive data to clients.

#### Acceptance Criteria

1. THE ErrorLogger SHALL use the existing Winston dependency to write structured JSON log entries.
2. WHEN an error with `statusCode` >= 500 occurs, THE ErrorLogger SHALL log at the `error` level including: timestamp, error `code`, `message`, `stack`, HTTP method, URL, and `requestId`.
3. WHEN an error with `statusCode` < 500 occurs, THE ErrorLogger SHALL log at the `warn` level including: timestamp, error `code`, `message`, HTTP method, URL, and `requestId`.
4. THE ErrorLogger SHALL never include raw database query strings, passwords, or secret keys in log entries.
5. WHERE a `LOG_LEVEL` environment variable is set, THE ErrorLogger SHALL use that value as the minimum log level.

### Requirement 5: Controller Migration

**User Story:** As a backend developer, I want all existing controllers to use the new error classes instead of inline `res.status().json()` error responses, so that error handling is consistent and maintainable.

#### Acceptance Criteria

1. WHEN a Controller cannot find a requested resource, THE Controller SHALL throw a NotFoundError rather than calling `res.status(404).json()` directly.
2. WHEN a Controller receives invalid input, THE Controller SHALL throw a ValidationError rather than calling `res.status(400).json()` directly.
3. WHEN a Controller encounters an unexpected error, THE Controller SHALL call `next(err)` to delegate to the ErrorHandler rather than calling `res.status(500).json()` directly.
4. THE escrowController SHALL be updated to replace all inline error responses with the appropriate AppError subclass throws or `next(err)` calls.
5. WHEN a BigInt conversion fails in a Controller, THE Controller SHALL throw a ValidationError with a descriptive message instead of checking `err.message` for the string `"Cannot convert"`.

### Requirement 6: No Sensitive Data Leakage

**User Story:** As a security engineer, I want to ensure that error responses never expose internal implementation details, so that attackers cannot use error messages to probe the system.

#### Acceptance Criteria

1. IF the application is running in production mode, THEN THE ErrorHandler SHALL replace the message of any Non_Operational_Error with the string `"An unexpected error occurred"` before sending the Error_Response.
2. THE ErrorHandler SHALL never include Prisma error objects, raw SQL, or database connection strings in the Error_Response.
3. WHEN a Prisma `PrismaClientKnownRequestError` with code `P2025` is received, THE ErrorHandler SHALL convert it to a NotFoundError before responding.
4. WHEN a Prisma `PrismaClientValidationError` is received, THE ErrorHandler SHALL convert it to a ValidationError with the message `"Invalid request data"` before responding.
5. THE ErrorHandler SHALL sanitize error messages to remove file system paths before including them in any Error_Response.
