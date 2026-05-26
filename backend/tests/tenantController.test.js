import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const prismaMock = {
  tenant: {
    findMany: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  user: { count: jest.fn() },
  escrow: { count: jest.fn() },
  dispute: { count: jest.fn() },
  payment: { count: jest.fn() },
  contractEvent: { count: jest.fn() },
  kycVerification: { count: jest.fn() },
  $transaction: jest.fn(),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: prismaMock,
}));

const { default: tenantController } = await import('../api/controllers/tenantController.js');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('tenantController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (ops) => Promise.all(ops));
  });

  it('returns the current tenant configuration', async () => {
    const req = {
      tenant: {
        id: 'tenant_1',
        slug: 'acme',
        name: 'Acme',
        status: 'active',
        domains: ['acme.example.com'],
        branding: { logoUrl: '/logo.png' },
        configuration: { theme: 'acme' },
        metadata: {},
      },
    };
    const res = createRes();

    await tenantController.getCurrentTenant(req, res);

    expect(res.body).toEqual({
      tenant: expect.objectContaining({
        id: 'tenant_1',
        slug: 'acme',
        branding: { logoUrl: '/logo.png' },
        configuration: { theme: 'acme' },
      }),
    });
  });

  it('creates a tenant from the management API payload', async () => {
    prismaMock.tenant.create.mockResolvedValue({
      id: 'tenant_2',
      slug: 'new-org',
      name: 'New Org',
      status: 'active',
      domains: ['new.example.com'],
      branding: {},
      configuration: {},
      metadata: {},
      createdAt: new Date('2026-03-26T00:00:00Z'),
      updatedAt: new Date('2026-03-26T00:00:00Z'),
    });

    const req = {
      body: {
        slug: 'New Org',
        name: 'New Org',
        domains: ['new.example.com'],
      },
    };
    const res = createRes();

    await tenantController.createTenant(req, res);

    expect(prismaMock.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'new-org',
          name: 'New Org',
        }),
      }),
    );
    expect(res.statusCode).toBe(201);
  });

  it('returns tenant metrics scoped to the requested tenant', async () => {
    const tenant = {
      id: 'tenant_1',
      slug: 'acme',
      name: 'Acme',
      status: 'active',
      domains: [],
      branding: {},
      configuration: {},
      metadata: {},
    };

    prismaMock.tenant.findFirst.mockResolvedValue(tenant);
    prismaMock.user.count.mockResolvedValue(2);
    prismaMock.escrow.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3);
    prismaMock.dispute.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1);
    prismaMock.payment.count.mockResolvedValue(7);
    prismaMock.contractEvent.count.mockResolvedValue(9);
    prismaMock.kycVerification.count.mockResolvedValue(2);

    const req = { params: { tenantId: 'tenant_1' } };
    const res = createRes();

    await tenantController.getTenantMetrics(req, res);

    expect(prismaMock.user.count).toHaveBeenCalledWith({ where: { tenantId: 'tenant_1' } });
    expect(prismaMock.escrow.count).toHaveBeenNthCalledWith(1, { where: { tenantId: 'tenant_1' } });
    expect(prismaMock.escrow.count).toHaveBeenNthCalledWith(2, {
      where: { tenantId: 'tenant_1', status: 'Active' },
    });
    expect(res.body.metrics).toEqual({
      users: 2,
      escrows: 5,
      activeEscrows: 3,
      disputes: 4,
      openDisputes: 1,
      payments: 7,
      events: 9,
      kycVerifications: 2,
    });
  });
});
