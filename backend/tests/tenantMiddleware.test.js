import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const prismaMock = {
  tenant: {
    findFirst: jest.fn(),
  },
};

const loggerMock = {
  info: jest.fn(),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: prismaMock,
}));
jest.unstable_mockModule('../lib/logger.js', () => ({
  createModuleLogger: jest.fn(() => loggerMock),
}));

const { default: tenantMiddleware } = await import('../api/middleware/tenant.js');
const { tenantResolutionTotal } = await import('../lib/metrics.js');

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
    tenantResolutionTotal.reset();
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
      expect.objectContaining({ where: { slug: 'acme' } }),
    );
    expect(req.tenant).toEqual(tenant);
    expect(next).toHaveBeenCalled();
    expect(res.headers['X-Tenant-Slug']).toBe('acme');
    expect(await tenantResolutionTotal.get()).toEqual(
      expect.objectContaining({
        values: [
          expect.objectContaining({
            labels: { source: 'tenant_slug', outcome: 'resolved' },
            value: 1,
          }),
        ],
      }),
    );
  });

  it('uses tenant ID before slug and hostname when selectors conflict', async () => {
    const idTenant = { id: 'id-match', slug: 'id-tenant', status: 'active' };
    prismaMock.tenant.findFirst.mockResolvedValueOnce(idTenant);

    const req = {
      headers: {
        'x-tenant-id': 'id-match',
        'x-tenant-slug': 'slug-match',
        host: 'host-match.example.com',
      },
    };
    const res = createRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(prismaMock.tenant.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'id-match' } }),
    );
    expect(req.tenant).toBe(idTenant);
    expect(next).toHaveBeenCalled();
  });

  it('tries lower-priority selectors when a higher-priority selector misses', async () => {
    const slugTenant = { id: 'slug-match', slug: 'acme', status: 'active' };
    prismaMock.tenant.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(slugTenant);

    const req = {
      headers: {
        'x-tenant-id': 'secret-id',
        'x-tenant-slug': 'acme',
      },
    };
    const res = createRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(prismaMock.tenant.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: 'secret-id' } }),
    );
    expect(prismaMock.tenant.findFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { slug: 'acme' } }),
    );
    expect(req.tenant).toBe(slugTenant);
    expect(loggerMock.info).toHaveBeenCalledWith(
      { event: 'tenant_resolution', source: 'tenant_slug', outcome: 'resolved' },
      'Tenant resolution completed',
    );
    expect(JSON.stringify(loggerMock.info.mock.calls)).not.toContain('secret-id');
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
    expect(loggerMock.info).toHaveBeenCalledWith(
      { event: 'tenant_resolution', source: 'tenant_id', outcome: 'not_found' },
      'Tenant resolution completed',
    );
  });

  it('returns 403 for an inactive matched tenant', async () => {
    prismaMock.tenant.findFirst.mockResolvedValue({
      id: 'inactive',
      slug: 'inactive',
      status: 'disabled',
    });

    const req = { headers: { 'x-tenant-id': 'inactive' } };
    const res = createRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: 'Tenant is not active' });
    expect(next).not.toHaveBeenCalled();
  });
});
