# Multi-Tenancy Isolation Model

This document describes how tenant isolation works in Stellar Crowd Fund Escrow — how tenants are identified, how data isolation is enforced at every layer, what happens when tenant context is missing, and where each enforcement point lives in the codebase.

---

## Overview

The platform uses a **shared database, shared schema** multi-tenancy model. All tenant data lives in the same PostgreSQL database with every tenant-owned table carrying a `tenant_id` foreign key. Isolation is enforced in two complementary layers:

1. **Request layer** — `tenantMiddleware` resolves the tenant for every incoming request and seeds it into an `AsyncLocalStorage` context.
2. **Query layer** — the Prisma client extension automatically injects `WHERE tenant_id = ?` (and sets `tenant_id` on writes) for every operation on tenant-scoped models, using the value from `AsyncLocalStorage`.

Neither layer is optional — requests blocked by `tenantMiddleware` never reach a controller, and queries that somehow reach Prisma without a tenant context fall through to a safe default rather than exposing cross-tenant data (details in [Queries without tenant context](#queries-without-tenant-context)).

---

## How tenants are identified

`backend/api/middleware/tenant.js` resolves a tenant from three possible sources, checked in this order:

| Source | Header / mechanism | Example |
|---|---|---|
| Explicit tenant ID | `X-Tenant-Id` request header | `X-Tenant-Id: tenant_abc123` |
| Tenant slug | `X-Tenant-Slug` request header | `X-Tenant-Slug: acme` |
| Custom domain | `Host` / `X-Forwarded-Host` header | `Host: acme.example.com` |

All three sources are checked together in a single `prisma.tenant.findFirst({ where: { OR: [...] } })` query. If more than one matches, the first result returned by Postgres wins (ordering is undefined — operators should not configure overlapping identifiers across tenants).

**Default tenant fallback.** If none of the three sources are present in the request, the middleware falls back to the tenant whose slug equals `DEFAULT_TENANT_SLUG` (env var, defaults to `"default"`). This means unauthenticated or header-less requests are served under the default tenant, not rejected. If you are running a single-tenant deployment this is correct behaviour. Multi-tenant operators should ensure every client sends an explicit identifier.

**Inactive tenant guard.** After resolving the tenant record, the middleware checks `tenant.status === 'active'`. A non-active tenant receives `403 Tenant is not active` and the request is terminated before any business logic runs.

**Response header.** Every response carries `X-Tenant-Slug` so clients can confirm which tenant resolved.

Relevant file: `backend/api/middleware/tenant.js`

---

## How tenant scoping is enforced at the query layer

### AsyncLocalStorage context

`backend/lib/tenantContext.js` manages tenant state using Node's `AsyncLocalStorage`. The middleware calls `runWithTenantContext(tenant, () => next())`, which wraps the entire request continuation (every `await`, every callback) in a storage context keyed to that tenant. No tenant state is stored in global variables or on the `req` object for query purposes — only in the async context.

Helper functions available anywhere in the request chain:

```js
getCurrentTenant()    // full tenant object, or null
getCurrentTenantId()  // tenant.id string, or null
isTenantScopeBypassed() // true only inside withTenantScopeBypassed()
```

### Prisma client extension (automatic WHERE injection)

`backend/lib/prisma.js` installs a `$extends` query extension that intercepts **every** Prisma operation at the ORM layer before it reaches Postgres:

```
findMany / findFirst / findFirstOrThrow / count / aggregate / groupBy
updateMany / deleteMany / findUnique / findUniqueOrThrow
→  args.where = mergeTenantWhere(args.where, tenantId)

create    →  args.data.tenantId  = tenantId (if not already set)
createMany→  each entry.tenantId = tenantId (if not already set)
upsert    →  args.create.tenantId = tenantId
```

The `mergeTenantWhere` helper wraps the caller's existing `where` clause in `AND [ existingWhere, { tenantId } ]` so it cannot be silently overridden by controller code.

The extension only fires for models in `TENANT_SCOPED_MODELS`:

```
User, Escrow, Milestone, ReputationRecord, Dispute, DisputeEvidence,
DisputeAppeal, UserProfile, ContractEvent, Payment, KycVerification,
WebhookSubscription, WebhookDelivery, AdminAuditLog, AuditLog
```

Models outside this set (`Tenant`, `RefreshToken`, `FeatureFlag`, etc.) are not filtered because they are either cross-tenant management tables or not tenant-owned.

Relevant files: `backend/lib/prisma.js`, `backend/lib/tenantContext.js`

### Cache key isolation

`backend/api/middleware/cache.js` builds HTTP response cache keys that include the tenant slug:

```
http:<tenant-slug>:<method>:<path>:<sorted-query-string>
```

A cache hit for tenant `acme` will never be served to a request resolving to tenant `beta`, because their keys do not collide.

Relevant file: `backend/api/middleware/cache.js` (`buildCacheKey`)

### Rate limit key isolation

The sliding-window rate limiter scopes counters per user address **and** per tenant. A user address shared across tenants (e.g. in a test environment) does not exhaust the rate limit of another tenant.

Relevant file: `backend/api/middleware/rateLimiter.js`

### Analytics metric isolation

`backend/api/middleware/analytics.js` prefixes every route metric key with `[tenant-slug]` so per-tenant dashboards receive distinct time series without post-processing.

Relevant file: `backend/api/middleware/analytics.js`

---

## Where `tenantMiddleware` is mounted

`backend/server.js` applies `tenantMiddleware` to the entire `/api` prefix before any route handler:

```js
app.use('/api', tenantMiddleware);
```

This means every request to `/api/*` resolves a tenant and seeds the async context before a single controller function runs. Routes outside `/api` (health probes `/health`, WebSocket upgrades, queue dashboard `/admin/queues`) are not tenant-scoped — they do not carry business data.

---

## Queries without tenant context

If a Prisma operation on a scoped model runs outside a tenant context (i.e. `getCurrentTenantId()` returns `null`), the Prisma extension **does not inject** a `WHERE tenant_id` clause and passes the query through unmodified. This means:

- A query with no explicit `tenantId` filter could return or modify rows belonging to any tenant.
- `create` / `createMany` / `upsert` fall back to `DEFAULT_TENANT_ID` (`tenant_default`) rather than failing.

**When can this happen?**

- Background workers and queue processors that call Prisma directly without first calling `runWithTenantContext`.
- Admin utility scripts that import the Prisma client and run queries outside an HTTP request.
- Code running in tests that does not set up tenant context.

**Mitigations already in place:**

- `withTenantScopeBypassed()` in `tenantContext.js` explicitly opts out of scoping for intentional cross-tenant operations (tenant management, metrics aggregation). Any call inside this wrapper is deliberate.
- The `listTenants`, `createTenant`, `updateTenant`, and `getTenantMetrics` handlers in `tenantController.js` use `withTenantScopeBypassed` and build their own explicit `where: { tenantId: tenant.id }` clauses when querying tenant-owned data.

**Contributor guidance:** Any background worker, queue processor, or scheduled job that reads or writes tenant-owned models must wrap its Prisma calls in `runWithTenantContext(tenant, callback)`. If processing a known set of tenants (e.g. the escrow indexer), fetch tenant records first and iterate with explicit context. If no tenant context is available and the operation is intentionally cross-tenant, use `withTenantScopeBypassed`.

---

## Data residency and compliance separation

The current model is **shared infrastructure**: all tenant data is in one PostgreSQL instance, one Redis instance, and one IPFS cluster. There is no per-tenant database, schema, or encryption namespace.

Implications for compliance requirements:

| Requirement | Current state | Path to satisfy |
|---|---|---|
| Logical data isolation | Enforced via `tenant_id` foreign key and Prisma extension | Satisfied for typical SaaS compliance |
| Physical data separation (e.g. GDPR Article 25 data minimisation) | Not implemented — rows from all tenants share tables | Requires per-tenant schema or database (schema-per-tenant approach is the lowest-friction path with Prisma) |
| Geographic data residency (e.g. EU data must stay in EU) | Not implemented — single deployment region | Requires multi-region deployment with tenant-to-region routing |
| Tenant data export / deletion (GDPR Article 17 / 20) | Planned (Roadmap Phase 4); not yet implemented | Add `DELETE FROM ... WHERE tenant_id = ?` cascade and export pipeline |
| Encryption at rest per tenant | Not implemented | Requires per-tenant encryption keys managed at application layer |

Until physical separation or per-tenant encryption is implemented, the platform cannot satisfy regulations that require tenant data to be stored separately from other tenants' data. Operators onboarding customers under strict data residency requirements should confirm these limitations before launch.

---

## All codebase locations that enforce tenant isolation

| File | What it does |
|---|---|
| `backend/api/middleware/tenant.js` | Resolves tenant from headers or hostname; terminates request if not found or inactive; seeds `AsyncLocalStorage` context via `runWithTenantContext` |
| `backend/lib/tenantContext.js` | `AsyncLocalStorage` wrapper; exports `getCurrentTenantId`, `getCurrentTenant`, `isTenantScopeBypassed`, `withTenantScopeBypassed`, `scopeCacheKey`, `scopeCacheTag` |
| `backend/lib/prisma.js` | Prisma `$extends` query extension; auto-injects `WHERE tenant_id` on reads and sets `tenant_id` on writes for all models in `TENANT_SCOPED_MODELS` |
| `backend/api/middleware/cache.js` | Builds HTTP cache keys prefixed with `tenant.slug` so responses never cross tenant boundaries |
| `backend/api/middleware/rateLimiter.js` | Scopes rate-limit counters per tenant to prevent one tenant's traffic exhausting another tenant's quota |
| `backend/api/middleware/analytics.js` | Prefixes route metric keys with `[tenant.slug]` for per-tenant analytics isolation |
| `backend/api/controllers/tenantController.js` | Uses `withTenantScopeBypassed` for cross-tenant admin operations; uses explicit `tenantId` filters in `getTenantMetrics` |
| `backend/api/controllers/disputeController.js` | Explicitly sets `where.tenantId = req.tenant.id` in list and detail queries as a redundant defence-in-depth guard |
| `backend/api/controllers/mfaController.js` | Passes `tenantId: req.tenant.id` in all MFA method queries and creates |
| `backend/api/controllers/adminController.js` | Scopes user management and audit log queries to `req.tenant.id` |
| `backend/api/controllers/reputationController.js` | Filters reputation records by `tenantId` |
| `backend/database/migrations/20260326000000_multitenancy.js` | Adds `tenant_id` column + FK to all tenant-owned tables; creates composite indexes; bootstraps the default tenant |
| `backend/server.js` | Mounts `tenantMiddleware` on `app.use('/api', tenantMiddleware)` — all API routes are covered |

---

## Known gaps and contributor checklist

Before adding a new Prisma query, verify:

- [ ] The code runs inside an active request context (tenant middleware already ran), **or** it explicitly calls `runWithTenantContext` / `withTenantScopeBypassed`.
- [ ] Background workers processing escrows, disputes, or other scoped models call `runWithTenantContext` for each tenant they handle.
- [ ] New models added to `schema.prisma` that own tenant data are added to the `TENANT_SCOPED_MODELS` set in `backend/lib/prisma.js` and the `TENANT_TABLES` array in the corresponding migration.
- [ ] Raw SQL (`$queryRaw`, `$executeRaw`) always includes an explicit `WHERE tenant_id = $N` parameter — the Prisma extension does not intercept raw queries.
- [ ] The `searchService.js` fallback search (`backend/services/searchService.js`) and archive fallback (`searchArchiveFallback`) do not currently accept a `tenantId` filter. Queries via this service are not tenant-scoped. This is a known gap — tracked in Issue #XX.
