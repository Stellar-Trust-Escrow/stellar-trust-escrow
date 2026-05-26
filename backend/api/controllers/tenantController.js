import prisma from '../../lib/prisma.js';
import { withTenantScopeBypassed } from '../../lib/tenantContext.js';

function normalizeSlug(value) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-') ?? '';
}

function sanitizeTenant(tenant) {
  if (!tenant) return null;

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    domains: tenant.domains,
    branding: tenant.branding ?? {},
    configuration: tenant.configuration ?? {},
    metadata: tenant.metadata ?? {},
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  };
}

const getCurrentTenant = async (req, res) => {
  res.json({ tenant: sanitizeTenant(req.tenant) });
};

const listTenants = async (_req, res) => {
  try {
    const tenants = await withTenantScopeBypassed(() =>
      prisma.tenant.findMany({
        orderBy: { createdAt: 'asc' },
      }),
    );

    res.json({ data: tenants.map(sanitizeTenant) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createTenant = async (req, res) => {
  try {
    const slug = normalizeSlug(req.body.slug);
    const {
      name,
      domains = [],
      branding = {},
      configuration = {},
      metadata = {},
      status = 'active',
    } = req.body;

    if (!slug || !name?.trim()) {
      return res.status(400).json({ error: 'slug and name are required' });
    }

    const tenant = await withTenantScopeBypassed(() =>
      prisma.tenant.create({
        data: {
          slug,
          name: name.trim(),
          status,
          domains,
          branding,
          configuration,
          metadata,
        },
      }),
    );

    res.status(201).json({ tenant: sanitizeTenant(tenant) });
  } catch (err) {
    const statusCode = err.code === 'P2002' ? 409 : 500;
    res.status(statusCode).json({ error: statusCode === 409 ? 'Tenant already exists' : err.message });
  }
};

const getTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await withTenantScopeBypassed(() =>
      prisma.tenant.findFirst({
        where: {
          OR: [{ id: tenantId }, { slug: normalizeSlug(tenantId) }],
        },
      }),
    );

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json({ tenant: sanitizeTenant(tenant) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const updates = {};
    const allowedFields = ['name', 'status', 'domains', 'branding', 'configuration', 'metadata'];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (req.body.slug !== undefined) {
      const slug = normalizeSlug(req.body.slug);
      if (!slug) {
        return res.status(400).json({ error: 'slug cannot be empty' });
      }
      updates.slug = slug;
    }

    const tenant = await withTenantScopeBypassed(async () => {
      const existingTenant = await prisma.tenant.findFirst({
        where: {
          OR: [{ id: tenantId }, { slug: normalizeSlug(tenantId) }],
        },
      });

      if (!existingTenant) return null;

      return prisma.tenant.update({
        where: { id: existingTenant.id },
        data: updates,
      });
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    res.json({ tenant: sanitizeTenant(tenant) });
  } catch (err) {
    const statusCode = err.code === 'P2002' ? 409 : 500;
    res.status(statusCode).json({ error: statusCode === 409 ? 'Tenant slug already exists' : err.message });
  }
};

const getTenantMetrics = async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await withTenantScopeBypassed(() =>
      prisma.tenant.findFirst({
        where: {
          OR: [{ id: tenantId }, { slug: normalizeSlug(tenantId) }],
        },
      }),
    );

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const scopedWhere = { tenantId: tenant.id };

    const [users, escrows, activeEscrows, disputes, openDisputes, payments, events, kyc] =
      await withTenantScopeBypassed(() =>
        prisma.$transaction([
          prisma.user.count({ where: scopedWhere }),
          prisma.escrow.count({ where: scopedWhere }),
          prisma.escrow.count({ where: { ...scopedWhere, status: 'Active' } }),
          prisma.dispute.count({ where: scopedWhere }),
          prisma.dispute.count({ where: { ...scopedWhere, resolvedAt: null } }),
          prisma.payment.count({ where: scopedWhere }),
          prisma.contractEvent.count({ where: scopedWhere }),
          prisma.kycVerification.count({ where: scopedWhere }),
        ]),
      );

    res.json({
      tenant: sanitizeTenant(tenant),
      metrics: {
        users,
        escrows,
        activeEscrows,
        disputes,
        openDisputes,
        payments,
        events,
        kycVerifications: kyc,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default {
  getCurrentTenant,
  listTenants,
  createTenant,
  getTenant,
  updateTenant,
  getTenantMetrics,
};
