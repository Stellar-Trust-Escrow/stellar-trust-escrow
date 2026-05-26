import { jest } from '@jest/globals';

const prismaMock = {
  payment: { findMany: jest.fn() },
  escrow: { findMany: jest.fn() },
  contractEvent: { findMany: jest.fn() },
  user: { findMany: jest.fn() },
  kycVerification: { findMany: jest.fn() },
  userProfile: { findMany: jest.fn() },
  reputationRecord: { findMany: jest.fn() },
  auditLog: { findMany: jest.fn() },
  adminAuditLog: { findMany: jest.fn() },
};

const auditServiceMock = {
  search: jest.fn(),
  log: jest.fn(),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({
  default: prismaMock,
}));

jest.unstable_mockModule('../services/auditService.js', () => ({
  AuditAction: {
    REPORT_GENERATED: 'REPORT_GENERATED',
    REPORT_EXPORTED: 'REPORT_EXPORTED',
    REPORT_SCHEDULED: 'REPORT_SCHEDULED',
    REPORT_SCHEDULED_RUN: 'REPORT_SCHEDULED_RUN',
    REPORT_SCHEDULE_DISABLED: 'REPORT_SCHEDULE_DISABLED',
  },
  AuditCategory: {
    REPORTING: 'REPORTING',
    PAYMENT: 'PAYMENT',
    KYC: 'KYC',
  },
  default: auditServiceMock,
}));

const {
  __resetForTests,
  createSchedule,
  disableSchedule,
  exportReport,
  generateReport,
  listSchedules,
  processDueSchedules,
} = await import('../services/complianceService.js');

beforeEach(() => {
  jest.clearAllMocks();
  __resetForTests();

  prismaMock.payment.findMany.mockResolvedValue([
    {
      id: 'pay_1',
      address: 'GABC123',
      escrowId: 42n,
      amountFiat: 1500,
      amountCrypto: '25.0',
      currency: 'usd',
      status: 'Completed',
      createdAt: new Date('2026-03-01T00:00:00Z'),
      updatedAt: new Date('2026-03-01T01:00:00Z'),
    },
  ]);
  prismaMock.escrow.findMany.mockResolvedValue([
    {
      id: 42n,
      clientAddress: 'GCLIENT',
      freelancerAddress: 'GFREELANCER',
      tokenAddress: 'TOKEN',
      totalAmount: '2500',
      remainingBalance: '1000',
      status: 'Active',
      milestones: [{ id: 1 }],
      dispute: null,
      createdAt: new Date('2026-03-01T00:00:00Z'),
    },
  ]);
  prismaMock.contractEvent.findMany.mockResolvedValue([
    {
      id: 7,
      eventType: 'esc_crt',
      escrowId: 42n,
      txHash: 'abc',
      ledger: 1200n,
      ledgerAt: new Date('2026-03-01T00:05:00Z'),
    },
  ]);
  prismaMock.user.findMany.mockResolvedValue([
    {
      id: 1,
      email: 'user@example.com',
      createdAt: new Date('2026-03-01T00:00:00Z'),
      updatedAt: new Date('2026-03-02T00:00:00Z'),
    },
  ]);
  prismaMock.kycVerification.findMany.mockResolvedValue([
    {
      address: 'GABC123',
      status: 'Approved',
      reviewResult: 'approved',
      rejectLabels: [],
      createdAt: new Date('2026-03-01T00:00:00Z'),
      updatedAt: new Date('2026-03-01T01:00:00Z'),
    },
  ]);
  prismaMock.userProfile.findMany.mockResolvedValue([
    {
      address: 'GABC123',
      displayName: 'User',
      createdAt: new Date('2026-03-01T00:00:00Z'),
      updatedAt: new Date('2026-03-01T01:00:00Z'),
    },
  ]);
  prismaMock.reputationRecord.findMany.mockResolvedValue([
    {
      address: 'GABC123',
      totalScore: 12n,
      completedEscrows: 2,
      disputedEscrows: 0,
      updatedAt: new Date('2026-03-01T01:00:00Z'),
    },
  ]);
  prismaMock.auditLog.findMany.mockResolvedValue([]);
  prismaMock.adminAuditLog.findMany.mockResolvedValue([
    {
      id: 5,
      action: 'SUSPEND_USER',
      targetAddress: 'GABC123',
      reason: 'Review',
      performedBy: 'admin',
      performedAt: new Date('2026-03-01T03:00:00Z'),
    },
  ]);
  auditServiceMock.search.mockResolvedValue({
    total: 1,
    data: [
      {
        id: 10n,
        category: 'PAYMENT',
        action: 'PAYMENT_COMPLETED',
        actor: 'system',
        resourceId: '42',
        statusCode: 200,
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-03-01T02:00:00Z'),
        metadata: { source: 'test' },
      },
    ],
  });
  auditServiceMock.log.mockResolvedValue(undefined);
});

describe('complianceService', () => {
  it('generates a transaction report with audit trail data', async () => {
    const report = await generateReport('transactions', { from: '2026-03-01T00:00:00Z' }, 'admin');

    expect(report.type).toBe('transactions');
    expect(report.summary.payments).toBe(1);
    expect(report.summary.escrows).toBe(1);
    expect(report.auditTrail.total).toBe(1);
    expect(report.transactions[0].id).toBe('pay_1');
    expect(auditServiceMock.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REPORT_GENERATED', resourceId: 'transactions' }),
    );
  });

  it('exports reports as csv and pdf', async () => {
    const csvExport = await exportReport('transactions', 'csv', {}, 'admin');
    const pdfExport = await exportReport('activity', 'pdf', {}, 'admin');

    expect(csvExport.contentType).toBe('text/csv');
    expect(csvExport.body).toContain('pay_1');
    expect(pdfExport.contentType).toBe('application/pdf');
    expect(Buffer.isBuffer(pdfExport.body)).toBe(true);
    expect(pdfExport.body.toString('utf8', 0, 8)).toContain('%PDF');
  });

  it('creates, runs, and disables scheduled reports', async () => {
    const schedule = await createSchedule({
      type: 'transactions',
      format: 'csv',
      frequency: 'daily',
      filters: { address: 'GABC123' },
      createdBy: 'admin',
    });

    expect(listSchedules().schedules).toHaveLength(1);

    schedule.nextRunAt = new Date(Date.now() - 1000).toISOString();
    const runs = await processDueSchedules();
    expect(runs).toHaveLength(1);
    expect(runs[0].scheduleId).toBe(schedule.id);
    expect(listSchedules().history).toHaveLength(1);

    const disabled = await disableSchedule(schedule.id, 'admin');
    expect(disabled.disabled).toBe(true);
  });
});
