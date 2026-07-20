import { jest } from '@jest/globals';
import fs from 'fs';

const ADDRESS_A = `G${'A'.repeat(55)}`;
const ADDRESS_B = `G${'B'.repeat(55)}`;

process.env.JWT_SECRET = 'test-secret';
process.env.EXPORT_SIGNING_SECRET = 'test-export-secret';

const prismaMock = {
  escrow: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
};

jest.unstable_mockModule('../../lib/prisma.js', () => ({
  default: prismaMock,
}));

jest.unstable_mockModule('../../queues/emailQueue.js', () => ({
  emailQueue: { add: jest.fn().mockResolvedValue({ id: 'email-job' }) },
  notificationsQueue: { add: jest.fn().mockResolvedValue({ id: 'email-job' }) },
}));

const { default: exportService } = await import('../../services/exportService.js');
const { exportQueue, __resetForTests } = await import('../../queues/exportQueue.js');

function makeEscrow(id, overrides = {}) {
  return {
    id: BigInt(id),
    status: 'Active',
    clientAddress: ADDRESS_A,
    freelancerAddress: ADDRESS_B,
    totalAmount: '1000',
    tokenAddress: 'CTOKEN',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    milestones: [{ status: 'Approved' }, { status: 'Approved' }, { status: 'Pending' }],
    dispute: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetForTests();
  prismaMock.escrow.count.mockResolvedValue(0);
  prismaMock.escrow.findMany.mockResolvedValue([]);
});

describe('exportService.buildExportWhere', () => {
  it('builds a filter with date range, status list and tenant scope', () => {
    const where = exportService.buildExportWhere({
      dateFrom: '2026-01-01',
      dateTo: '2026-02-01',
      status: ['Active', 'Completed'],
      tenantId: 'tenant_default',
    });

    expect(where.tenantId).toBe('tenant_default');
    expect(where.createdAt.gte).toEqual(new Date('2026-01-01'));
    expect(where.createdAt.lte).toEqual(new Date('2026-02-01'));
    expect(where.status).toEqual({ in: ['Active', 'Completed'] });
  });

  it('omits optional clauses when not provided', () => {
    const where = exportService.buildExportWhere({});
    expect(where).toEqual({});
  });
});

describe('exportService.escrowToRow', () => {
  it('maps every required CSV column, counting approved milestones', () => {
    const row = exportService.escrowToRow(
      makeEscrow(42, {
        dispute: {
          raisedAt: new Date('2026-01-03T00:00:00.000Z'),
          resolvedAt: new Date('2026-01-04T00:00:00.000Z'),
        },
      }),
    );

    expect(row).toEqual({
      escrow_id: '42',
      status: 'Active',
      client_address: ADDRESS_A,
      freelancer_address: ADDRESS_B,
      total_amount: '1000',
      token: 'CTOKEN',
      milestones_count: 3,
      milestones_approved: 2,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
      dispute_raised_at: '2026-01-03T00:00:00.000Z',
      resolved_at: '2026-01-04T00:00:00.000Z',
    });
  });

  it('leaves dispute columns empty when there is no dispute', () => {
    const row = exportService.escrowToRow(makeEscrow(1));
    expect(row.dispute_raised_at).toBe('');
    expect(row.resolved_at).toBe('');
  });
});

describe('exportService.createExportJob', () => {
  it('rejects unsupported formats', async () => {
    await expect(exportService.createExportJob({ format: 'pdf' })).rejects.toThrow(
      /Unsupported export format/,
    );
  });

  it('creates a pending job, estimates time and enqueues work', async () => {
    prismaMock.escrow.count.mockResolvedValue(5000);

    const { jobId, estimatedSeconds } = await exportService.createExportJob({
      format: 'csv',
      dateFrom: '2026-01-01',
      dateTo: '2026-02-01',
      status: ['Active'],
      tenantId: 'tenant_default',
      requestedBy: ADDRESS_A,
    });

    expect(jobId).toEqual(expect.any(String));
    expect(estimatedSeconds).toBe(10); // ceil(5000 / 500)

    const status = await exportService.getJobStatus(jobId);
    expect(status.status).toBe('pending');
    expect(status.total).toBe(5000);

    const queued = await exportQueue.getWaiting();
    expect(queued).toHaveLength(1);
    expect(queued[0].id).toBe(jobId);
    expect(queued[0].data.format).toBe('csv');
  });
});

describe('exportService signed download URLs', () => {
  it('accepts a valid, unexpired signature', () => {
    const expires = Date.now() + 60_000;
    const signature = exportService.signDownload('job-1', expires);
    expect(exportService.verifyDownloadSignature('job-1', expires, signature)).toEqual({
      valid: true,
    });
  });

  it('rejects an expired signature', () => {
    const expires = Date.now() - 1000;
    const signature = exportService.signDownload('job-1', expires);
    const result = exportService.verifyDownloadSignature('job-1', expires, signature);
    expect(result).toEqual({ valid: false, reason: 'expired' });
  });

  it('rejects a tampered signature', () => {
    const expires = Date.now() + 60_000;
    const result = exportService.verifyDownloadSignature('job-1', expires, 'deadbeef');
    expect(result.valid).toBe(false);
  });
});

describe('exportService.processExportJob', () => {
  it('generates a CSV with correct headers and all matching rows', async () => {
    const escrows = [makeEscrow(1), makeEscrow(2), makeEscrow(3)];
    prismaMock.escrow.count.mockResolvedValue(escrows.length);
    // Single page (< batch size) ends cursor pagination after one query.
    prismaMock.escrow.findMany.mockResolvedValueOnce(escrows);

    const jobId = 'csv-job';
    await exportService.setJobStatus(jobId, { total: escrows.length });
    const result = await exportService.processExportJob(jobId, {
      format: 'csv',
      tenantId: 'tenant_default',
    });

    expect(result.status).toBe('done');
    expect(result.downloadUrl).toContain(`/api/v1/escrows/export/${jobId}/download`);

    const status = await exportService.getJobStatus(jobId);
    expect(status.status).toBe('done');
    expect(status.progress).toBe(100);

    const content = fs.readFileSync(status.filePath, 'utf8').trim();
    const lines = content.split('\n');
    expect(lines[0].trim()).toBe(
      'escrow_id,status,client_address,freelancer_address,total_amount,token,milestones_count,milestones_approved,created_at,updated_at,dispute_raised_at,resolved_at',
    );
    expect(lines).toHaveLength(escrows.length + 1); // header + rows
    expect(lines[1]).toContain('1,Active');

    fs.unlinkSync(status.filePath);
  });

  it('generates a valid XLSX file that can be reopened', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const escrows = [makeEscrow(10), makeEscrow(11)];
    prismaMock.escrow.count.mockResolvedValue(escrows.length);
    prismaMock.escrow.findMany.mockResolvedValueOnce(escrows);

    const jobId = 'xlsx-job';
    await exportService.setJobStatus(jobId, { total: escrows.length });
    const result = await exportService.processExportJob(jobId, { format: 'xlsx' });
    expect(result.status).toBe('done');

    const status = await exportService.getJobStatus(jobId);
    expect(fs.statSync(status.filePath).size).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(status.filePath);
    const sheet = workbook.getWorksheet('Escrows') || workbook.worksheets[0];
    expect(sheet).toBeTruthy();

    const rows = [];
    sheet.eachRow((row) => rows.push(row.values));
    // header row + 2 data rows
    expect(rows).toHaveLength(3);
    expect(sheet.getRow(1).getCell(1).value).toBe('escrow_id');

    fs.unlinkSync(status.filePath);
  });

  it('marks the job failed and rethrows when generation errors', async () => {
    prismaMock.escrow.count.mockResolvedValue(1);
    prismaMock.escrow.findMany.mockRejectedValue(new Error('db exploded'));

    const jobId = 'fail-job';
    await expect(exportService.processExportJob(jobId, { format: 'csv' })).rejects.toThrow(
      'db exploded',
    );

    const status = await exportService.getJobStatus(jobId);
    expect(status.status).toBe('failed');
    expect(status.error).toBe('db exploded');
  });
});
