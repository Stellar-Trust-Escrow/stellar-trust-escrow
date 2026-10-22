# Tenant Resolution Precedence and Telemetry

## Purpose

Make tenant selection deterministic when a request contains more than one tenant selector, and emit bounded telemetry that helps explain how resolution completed. Tenant middleware selects request context; it does not perform the business effects handled by downstream routes.

The phrase “prevent retries and concurrent requests from applying the same effect twice” is an idempotency concern for effectful operations. It is not achieved by tenant resolution alone. Those operations need their own idempotency or deduplication mechanism. This document scopes the middleware work to selecting a tenant consistently and observing that decision.

## Scope

The relevant implementation is `backend/api/middleware/tenant.js`. It currently reads `x-tenant-id`, `x-tenant-slug`, and the request hostname. With one or more selectors it queries for a tenant matching any supplied selector; with no selectors it looks up the configured default tenant. A missing match returns 404, and an inactive tenant returns 403.

The intended precedence is:

1. Tenant ID (`x-tenant-id`)
2. Tenant slug (`x-tenant-slug`)
3. Hostname (`x-forwarded-host`, then `host`)
4. Default tenant, only when no usable explicit selector was supplied

A higher-priority selector determines the result when multiple selectors are present. A supplied but unmatched explicit selector should not silently fall through to a lower-priority selector or the default tenant. This avoids selecting a different tenant than the request explicitly identified. Requests with no usable selector retain the existing default-tenant behavior.

No other response shape, tenant context behavior, selected tenant fields, or downstream request behavior should change.

## Structured Telemetry

Record a bounded resolution outcome and the selector source, using stable labels such as `id`, `slug`, `hostname`, `default`, and `not_found`. Correlate log records with an existing request correlation identifier when available. Keep metric dimensions bounded: do not use tenant IDs, slugs, hostnames, request paths, or other user-controlled values as metric labels.

Logs and errors must be deterministic and must not include raw selector values, tenant records, credentials, tokens, or other secrets. Telemetry should describe which resolution path was taken and its outcome, not disclose the selector itself. Preserve the existing HTTP error messages and status codes.

## Expected Paths

- **Success:** a valid ID, slug, hostname, or default lookup resolves an active tenant, attaches it to the request and response locals, sets `X-Tenant-Slug`, establishes tenant async context, and continues the request.
- **Explicit selector miss:** the highest-priority usable selector does not resolve; return the existing 404 response and do not continue to a lower-priority selector or the default tenant.
- **Inactive tenant:** a resolved tenant is not active; return the existing 403 response and do not continue the request.
- **No selector:** resolve the default tenant as before. If it is unavailable, return the existing 404 response.
- **Lookup error:** pass the error to Express `next(err)` as before; telemetry must not replace or expose the error details to the client.

## Test Coverage

Automated middleware tests should cover:

1. Successful resolution and all existing tenant-context side effects.
2. Multiple selectors with conflicting matches, proving ID takes precedence over slug and hostname.
3. An explicit-selector miss, proving there is no fallback to another selector or to the default tenant.
4. An inactive tenant returning 403.
5. No-selector default resolution, retaining the current behavior.
6. Telemetry labels and correlated logs for representative success and failure outcomes, asserting that raw tenant identifiers and hostnames are absent.

The primary success test plus at least two failure or boundary tests should be required for the precedence change. Existing behavior tests should remain in place to guard compatibility.

## Acceptance Checklist

- Tenant selection follows the documented precedence deterministically.
- Changes remain limited to tenant resolution and its telemetry.
- Existing response codes, response bodies, context setup, and default behavior remain unchanged outside precedence.
- Telemetry uses bounded labels, correlates records where possible, and contains no selector values or secrets.
- Automated tests cover success and multiple failure or boundary paths.
- Existing lint, test, and build commands pass.
