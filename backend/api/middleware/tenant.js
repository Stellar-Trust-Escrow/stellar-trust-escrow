import prisma from '../../lib/prisma.js';
import { createModuleLogger } from '../../lib/logger.js';
import { tenantResolutionTotal } from '../../lib/metrics.js';
import { DEFAULT_TENANT_SLUG, runWithTenantContext } from '../../lib/tenantContext.js';

const logger = createModuleLogger('tenant-middleware');

const TENANT_SELECT = {
  id: true,
  slug: true,
  name: true,
  status: true,
  domains: true,
  branding: true,
  configuration: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
};

function extractHostname(req) {
  const forwardedHost = req.headers['x-forwarded-host'];
  const rawHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost || req.headers.host;

  if (!rawHost) return null;

  return rawHost.split(',')[0].trim().split(':')[0].toLowerCase();
}

async function findTenant(req) {
  const tenantId = req.headers['x-tenant-id'];
  const tenantSlug = req.headers['x-tenant-slug'];
  const hostname = extractHostname(req);

  const selectors = [];
  if (typeof tenantId === 'string' && tenantId.trim()) {
    selectors.push({ source: 'tenant_id', where: { id: tenantId.trim() } });
  }
  if (typeof tenantSlug === 'string' && tenantSlug.trim()) {
    selectors.push({ source: 'tenant_slug', where: { slug: tenantSlug.trim().toLowerCase() } });
  }
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    selectors.push({ source: 'hostname', where: { domains: { has: hostname } } });
  }

  if (selectors.length > 0) {
    for (const selector of selectors) {
      const matchedTenant = await prisma.tenant.findFirst({
        where: selector.where,
        select: TENANT_SELECT,
      });

      if (matchedTenant) return { tenant: matchedTenant, source: selector.source };
    }

    return { tenant: null, source: selectors[0].source };
  }

  return {
    tenant: await prisma.tenant.findFirst({
      where: { slug: DEFAULT_TENANT_SLUG },
      select: TENANT_SELECT,
    }),
    source: 'default',
  };
}

function recordResolution(source, outcome) {
  tenantResolutionTotal.inc({ source, outcome });
  logger.info({ event: 'tenant_resolution', source, outcome }, 'Tenant resolution completed');
}

export default async function tenantMiddleware(req, res, next) {
  let source = 'none';

  try {
    const result = await findTenant(req);
    const { tenant } = result;
    source = result.source;

    if (!tenant) {
      recordResolution(source, 'not_found');
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (tenant.status !== 'active') {
      recordResolution(source, 'inactive');
      return res.status(403).json({ error: 'Tenant is not active' });
    }

    req.tenant = tenant;
    res.locals.tenant = tenant;
    res.setHeader('X-Tenant-Slug', tenant.slug);
    recordResolution(source, 'resolved');

    return runWithTenantContext(tenant, () => next());
  } catch (err) {
    recordResolution(source, 'error');
    return next(err);
  }
}
