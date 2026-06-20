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
