import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const prismaMock = {
  tenant: {
    findFirst: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: prismaMock,
}));

const { default: tenantMiddleware } = await import('../api/middleware/tenant.js');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    locals: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
  };
}

describe('tenant middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves a tenant from the request header and seeds async context', async () => {
    const tenant = {
      id: 'tenant_1',
      slug: 'acme',
      name: 'Acme',
      status: 'active',
      domains: ['acme.example.com'],
      branding: {},
      configuration: {},
      metadata: {},
    };
    prismaMock.tenant.findFirst.mockResolvedValue(tenant);

    const req = {
      headers: {
        'x-tenant-slug': 'acme',
      },
    };
    const res = createRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(prismaMock.tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'acme' },
      }),
    );
    expect(req.tenant).toEqual(tenant);
    expect(next).toHaveBeenCalled();
    expect(res.headers['X-Tenant-Slug']).toBe('acme');
  });

  it('prefers tenant ID over slug and hostname when multiple selectors are supplied', async () => {
    const tenantById = {
      id: 'tenant_id',
      slug: 'by-id',
      status: 'active',
    };
    prismaMock.tenant.findFirst.mockResolvedValue(tenantById);

    const req = {
      headers: {
        'x-tenant-id': 'tenant_id',
        'x-tenant-slug': 'by-slug',
        host: 'by-host.example.com',
      },
    };
    const res = createRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(prismaMock.tenant.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tenant_id' } }),
    );
    expect(req.tenant).toBe(tenantById);
    expect(next).toHaveBeenCalled();
  });

  it('tries the next selector when a higher-priority tenant ID does not match', async () => {
    const tenantBySlug = {
      id: 'tenant_slug',
      slug: 'by-slug',
      status: 'active',
    };
    prismaMock.tenant.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(tenantBySlug);

    const req = {
      headers: {
        'x-tenant-id': 'missing-tenant',
        'x-tenant-slug': 'by-slug',
        host: 'by-host.example.com',
      },
    };
    const res = createRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(prismaMock.tenant.findFirst.mock.calls.map(([query]) => query.where)).toEqual([
      { id: 'missing-tenant' },
      { slug: 'by-slug' },
    ]);
    expect(req.tenant).toBe(tenantBySlug);
    expect(next).toHaveBeenCalled();
  });

  it('falls back to the default tenant when no identifier is supplied', async () => {
    const tenant = {
      id: 'tenant_default',
      slug: 'default',
      name: 'Default Tenant',
      status: 'active',
      domains: [],
      branding: {},
      configuration: {},
      metadata: {},
    };
    prismaMock.tenant.findFirst.mockResolvedValue(tenant);

    const req = { headers: {} };
    const res = createRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(prismaMock.tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'default' },
      }),
    );
    expect(next).toHaveBeenCalled();
  });

  it('returns 404 when an explicit tenant identifier does not match a tenant', async () => {
    prismaMock.tenant.findFirst.mockResolvedValue(null);

    const req = {
      headers: {
        'x-tenant-id': 'missing-tenant',
      },
    };
    const res = createRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Tenant not found' });
    expect(next).not.toHaveBeenCalled();
  });
});
