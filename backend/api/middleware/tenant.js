import prisma from '../../lib/prisma.js';
import { DEFAULT_TENANT_SLUG, runWithTenantContext } from '../../lib/tenantContext.js';

function extractHostname(req) {
  const forwardedHost = req.headers['x-forwarded-host'];
  const rawHost = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req.headers.host;

  if (!rawHost) return null;

  return rawHost.split(',')[0].trim().split(':')[0].toLowerCase();
}

async function findTenant(req) {
  const tenantId = req.headers['x-tenant-id'];
  const tenantSlug = req.headers['x-tenant-slug'];
  const hostname = extractHostname(req);

  const or = [];
  if (typeof tenantId === 'string' && tenantId.trim()) {
    or.push({ id: tenantId.trim() });
  }
  if (typeof tenantSlug === 'string' && tenantSlug.trim()) {
    or.push({ slug: tenantSlug.trim().toLowerCase() });
  }
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    or.push({ domains: { has: hostname } });
  }

  if (or.length > 0) {
    const matchedTenant = await prisma.tenant.findFirst({
      where: { OR: or },
      select: {
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
      },
    });

    if (matchedTenant) return matchedTenant;
    return null;
  }

  return prisma.tenant.findFirst({
    where: { slug: DEFAULT_TENANT_SLUG },
    select: {
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
    },
  });
}

export default async function tenantMiddleware(req, res, next) {
  try {
    const tenant = await findTenant(req);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    if (tenant.status !== 'active') {
      return res.status(403).json({ error: 'Tenant is not active' });
    }

    req.tenant = tenant;
    res.locals.tenant = tenant;
    res.setHeader('X-Tenant-Slug', tenant.slug);

    return runWithTenantContext(tenant, () => next());
  } catch (err) {
    return next(err);
  }
}
