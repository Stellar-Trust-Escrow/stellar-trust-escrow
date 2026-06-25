import { AsyncLocalStorage } from 'async_hooks';

const tenantStorage = new AsyncLocalStorage();

export const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG || 'default';
export const DEFAULT_TENANT_ID = process.env.DEFAULT_TENANT_ID || 'tenant_default';

export function runWithTenantContext(tenant, callback) {
  return tenantStorage.run({ tenant, bypassTenantScope: false }, callback);
}

export function getTenantContext() {
  return tenantStorage.getStore() ?? null;
}

export function getCurrentTenant() {
  return getTenantContext()?.tenant ?? null;
}

export function getCurrentTenantId() {
  return getCurrentTenant()?.id ?? null;
}

export function isTenantScopeBypassed() {
  return getTenantContext()?.bypassTenantScope === true;
}

export async function withTenantScopeBypassed(callback) {
  const store = getTenantContext();
  if (!store) return callback();

  return tenantStorage.run(
    {
      ...store,
      bypassTenantScope: true,
    },
    callback,
  );
}

export function scopeCacheKey(key, tenant = getCurrentTenant()) {
  if (isTenantScopeBypassed()) return key;
  if (!tenant) return key;
  return `tenant:${tenant.slug || tenant.id}:${key}`;
}

export function scopeCacheTag(tag, tenant = getCurrentTenant()) {
  if (isTenantScopeBypassed()) return tag;
  if (!tenant) return tag;
  return `tenant:${tenant.slug || tenant.id}:tag:${tag}`;
}

// ── Knex tenant scope ─────────────────────────────────────────────────────────

/**
 * Apply automatic tenant_id scoping to a Knex query builder.
 *
 * Usage:
 *   const rows = await tenantScope(knex('escrows')).where({ status: 'Active' });
 *
 * If the scope is bypassed (e.g. admin context) or no tenant is active,
 * the query is returned unmodified.
 *
 * @param {import('knex').Knex.QueryBuilder} qb - Knex query builder
 * @param {string} [column='tenant_id'] - column name to filter on
 * @returns {import('knex').Knex.QueryBuilder}
 */
export function tenantScope(qb, column = 'tenant_id') {
  if (isTenantScopeBypassed()) return qb;
  const id = getCurrentTenantId();
  if (!id) return qb;
  return qb.where(column, id);
}

// ── Tenant-scoped audit helpers ───────────────────────────────────────────────

/**
 * Returns a Prisma `where` fragment that scopes to the current tenant.
 * Use inside any prisma.auditLog / prisma.adminAuditLog query.
 *
 *   const where = tenantAuditFilter({ actor: 'G...' });
 *   await prisma.auditLog.findMany({ where });
 */
export function tenantAuditFilter(extra = {}) {
  const id = getCurrentTenantId();
  if (!id || isTenantScopeBypassed()) return extra;
  return { tenantId: id, ...extra };
}

/**
 * Scope a Prisma query object to the current tenant by injecting tenantId.
 * Works for any model that has a tenantId field.
 *
 *   const where = withTenantId({ status: 'Active' });
 *   await prisma.escrow.findMany({ where });
 */
export function withTenantId(where = {}) {
  const id = getCurrentTenantId();
  if (!id || isTenantScopeBypassed()) return where;
  return { tenantId: id, ...where };
}
