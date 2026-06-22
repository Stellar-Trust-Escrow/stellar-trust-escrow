import { jest } from '@jest/globals';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const ADDRESS_A = `G${'A'.repeat(55)}`;
const ADDRESS_B = `G${'B'.repeat(55)}`;
const ADMIN_API_KEY = 'test-admin-key';

process.env.ADMIN_API_KEY = ADMIN_API_KEY;
process.env.JWT_SECRET = 'test-secret';

const prismaMock = {
  escrow: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  kycVerification: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  reputationRecord: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  adminAuditLog: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  chatRoomKey: {
    findMany: jest.fn(),
  },
  chatMessage: {
    findMany: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
  userProfile: {
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const emailQueueMock = {
  add: jest.fn(async () => ({ id: 'email-1' })),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: prismaMock,
}));

jest.unstable_mockModule('../queues/emailQueue.js', () => ({
  emailQueue: emailQueueMock,
}));

const { default: userRoutes } = await import('../api/routes/userRoutes.js');
const { default: exportService } = await import('../services/exportService.js');

function bearerToken(address = ADDRESS_A) {
  return `Bearer ${jwt.sign({ address, type: 'access' }, process.env.JWT_SECRET)}`;
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes);
  return app;
}

function resetExportMocks() {
  jest.clearAllMocks();
  prismaMock.escrow.findMany.mockResolvedValue([]);
  prismaMock.payment.findMany.mockResolvedValue([]);
  prismaMock.kycVerification.findUnique.mockResolvedValue(null);
  prismaMock.kycVerification.findFirst.mockResolvedValue(null);
  prismaMock.reputationRecord.findUnique.mockResolvedValue(null);
  prismaMock.reputationRecord.findFirst.mockResolvedValue(null);
  prismaMock.adminAuditLog.findMany.mockResolvedValue([]);
  prismaMock.adminAuditLog.create.mockResolvedValue({ id: 1 });
  prismaMock.chatRoomKey.findMany.mockResolvedValue([]);
  prismaMock.chatMessage.findMany.mockResolvedValue([]);
  prismaMock.user.findFirst.mockResolvedValue(null);
}

beforeEach(() => {
  resetExportMocks();
});

describe('GDPR export route protection', () => {
  it('returns 403 when an authenticated user exports a different address', async () => {
    const app = createApp();

    await request(app)
      .get(`/api/users/${ADDRESS_B}/export`)
      .set('Authorization', bearerToken(ADDRESS_A))
      .expect(403)
      .expect(({ body }) => {
        expect(body.error).toBe('Forbidden');
      });

    expect(prismaMock.escrow.findMany).not.toHaveBeenCalled();
  });

  it('allows admins to export any address and logs DATA_EXPORT', async () => {
    const app = createApp();

    await request(app)
      .get(`/api/users/${ADDRESS_B}/export`)
      .set('x-admin-api-key', ADMIN_API_KEY)
      .expect(200);

    expect(prismaMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'DATA_EXPORT',
        targetAddress: ADDRESS_B,
        performedBy: 'admin',
      }),
    });
  });

  it('limits exports to 3 requests per address per hour', async () => {
    const app = createApp();

    for (let i = 0; i < 3; i++) {
      await request(app)
        .get(`/api/users/${ADDRESS_A}/export`)
        .set('Authorization', bearerToken(ADDRESS_A))
        .expect(200);
    }

    await request(app)
      .get(`/api/users/${ADDRESS_A}/export`)
      .set('Authorization', bearerToken(ADDRESS_A))
      .expect(429);
  });
});

describe('exportService GDPR data scope', () => {
  it('includes sanitized admin audit actions and dispute messages', async () => {
    const performedAt = new Date('2026-06-19T12:00:00.000Z');
    prismaMock.adminAuditLog.findMany.mockResolvedValue([
      {
        action: 'SUSPEND_USER',
        targetAddress: ADDRESS_A,
        reason: 'appeal denied',
        performedBy: 'admin@example.com',
        performedAt,
      },
    ]);
    prismaMock.chatRoomKey.findMany.mockResolvedValue([{ roomId: 'dispute:1' }]);
    prismaMock.chatMessage.findMany.mockResolvedValue([
      {
        id: 7,
        roomId: 'dispute:1',
        senderAddress: ADDRESS_B,
        ciphertext: 'cipher',
        iv: 'iv',
        tag: 'tag',
        sentAt: performedAt,
      },
    ]);

    const exported = await exportService.exportUserData(ADDRESS_A, { tenantId: 'tenant_default' });

    expect(prismaMock.adminAuditLog.findMany).toHaveBeenCalledWith({
      where: { targetAddress: ADDRESS_A, tenantId: 'tenant_default' },
      orderBy: { performedAt: 'desc' },
    });
    expect(prismaMock.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ senderAddress: ADDRESS_A }, { roomId: { in: ['dispute:1'] } }],
        },
      }),
    );
    expect(exported.data.adminAuditLog).toEqual([
      {
        action: 'SUSPEND_USER',
        targetAddress: ADDRESS_A,
        timestamp: '2026-06-19T12:00:00.000Z',
        outcome: 'appeal denied',
      },
    ]);
    expect(exported.data.adminAuditLog[0]).not.toHaveProperty('performedBy');
    expect(exported.data.disputeMessages).toHaveLength(1);
  });

  it('pseudonymizes address fields while preserving references', async () => {
    const count = (n) => Promise.resolve({ count: n });
    prismaMock.escrow.updateMany
      .mockImplementationOnce(() => count(1))
      .mockImplementationOnce(() => count(2))
      .mockImplementationOnce(() => count(0));
    prismaMock.payment.updateMany.mockResolvedValue({ count: 3 });
    prismaMock.kycVerification.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.reputationRecord.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.userProfile.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));

    const result = await exportService.pseudonymizeUserData(ADDRESS_A, {
      tenantId: 'tenant_default',
      performedBy: 'admin',
    });

    expect(result.pseudonym).toMatch(/^anon_[a-f0-9]{32}$/);
    expect(prismaMock.escrow.updateMany).toHaveBeenCalledWith({
      where: { clientAddress: ADDRESS_A, tenantId: 'tenant_default' },
      data: { clientAddress: result.pseudonym },
    });
    expect(prismaMock.payment.updateMany).toHaveBeenCalledWith({
      where: { address: ADDRESS_A, tenantId: 'tenant_default' },
      data: { address: result.pseudonym },
    });
    expect(prismaMock.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'GDPR_DATA_PSEUDONYMIZE',
        targetAddress: result.pseudonym,
      }),
    });
    expect(result.updated.payments).toBe(3);
  });
});
