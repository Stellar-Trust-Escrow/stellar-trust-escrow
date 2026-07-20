import { jest } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';

process.env.NODE_ENV = 'test';
process.env.EXPORT_SIGNING_SECRET = 'integration-export-secret';

const ADDRESS_A = `G${'A'.repeat(55)}`;
const ADDRESS_B = `G${'B'.repeat(55)}`;

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

// Bypass JWT verification: treat any request as authenticated.
jest.unstable_mockModule('../../api/middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { address: ADDRESS_A };
    next();
  },
}));

const { default: exportRoutes } = await import('../../api/routes/exportRoutes.js');
const { default: exportService } = await import('../../services/exportService.js');

function makeEscrow(id) {
  return {
    id: BigInt(id),
    status: 'Active',
    clientAddress: ADDRESS_A,
    freelancerAddress: ADDRESS_B,
    totalAmount: '1000',
    tokenAddress: 'CTOKEN',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    milestones: [{ status: 'Approved' }, { status: 'Pending' }],
    dispute: null,
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/escrows/export', exportRoutes);
  return app;
}

let request;

beforeAll(() => {
  request = supertest(buildApp());
});

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.escrow.count.mockResolvedValue(0);
  prismaMock.escrow.findMany.mockResolvedValue([]);
});

describe('POST /api/v1/escrows/export', () => {
  it('rejects an invalid format with 400', async () => {
    const res = await request
      .post('/api/v1/escrows/export')
      .send({ format: 'pdf', dateFrom: '2026-01-01', dateTo: '2026-02-01' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid export request');
  });

  it('rejects when dateTo precedes dateFrom', async () => {
    const res = await request
      .post('/api/v1/escrows/export')
      .send({ format: 'csv', dateFrom: '2026-02-01', dateTo: '2026-01-01' });

    expect(res.status).toBe(400);
  });

  it('queues a job and returns 202 with jobId + estimate', async () => {
    prismaMock.escrow.count.mockResolvedValue(1200);

    const res = await request
      .post('/api/v1/escrows/export')
      .send({ format: 'csv', dateFrom: '2026-01-01', dateTo: '2026-02-01', status: ['Active'] });

    expect(res.status).toBe(202);
    expect(res.body.jobId).toEqual(expect.any(String));
    expect(res.body.estimatedSeconds).toBe(3); // ceil(1200 / 500)

    const status = await exportService.getJobStatus(res.body.jobId);
    expect(status.status).toBe('pending');
  });
});

describe('GET /api/v1/escrows/export/:jobId/status', () => {
  it('returns 404 for an unknown job', async () => {
    const res = await request.get('/api/v1/escrows/export/does-not-exist/status');
    expect(res.status).toBe(404);
  });

  it('reflects the job lifecycle: pending → done with a download URL', async () => {
    prismaMock.escrow.count.mockResolvedValue(2);

    const create = await request
      .post('/api/v1/escrows/export')
      .send({ format: 'csv', dateFrom: '2026-01-01', dateTo: '2026-02-01' });
    const { jobId } = create.body;

    let res = await request.get(`/api/v1/escrows/export/${jobId}/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');
    expect(res.body.progress).toBe(0);

    // Drive the worker logic directly (in-memory queue does not auto-process).
    prismaMock.escrow.findMany.mockResolvedValueOnce([makeEscrow(1), makeEscrow(2)]);
    await exportService.processExportJob(jobId, {
      format: 'csv',
      dateFrom: '2026-01-01',
      dateTo: '2026-02-01',
    });

    res = await request.get(`/api/v1/escrows/export/${jobId}/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.progress).toBe(100);
    expect(res.body.downloadUrl).toContain(`/api/v1/escrows/export/${jobId}/download`);
  });
});

describe('GET /api/v1/escrows/export/:jobId/download', () => {
  async function createCompletedJob() {
    prismaMock.escrow.count.mockResolvedValue(2);
    const create = await request
      .post('/api/v1/escrows/export')
      .send({ format: 'csv', dateFrom: '2026-01-01', dateTo: '2026-02-01' });
    const { jobId } = create.body;
    prismaMock.escrow.findMany.mockResolvedValueOnce([makeEscrow(1), makeEscrow(2)]);
    await exportService.processExportJob(jobId, {
      format: 'csv',
      dateFrom: '2026-01-01',
      dateTo: '2026-02-01',
    });
    return jobId;
  }

  it('streams the CSV for a valid signature', async () => {
    const jobId = await createCompletedJob();
    const expires = Date.now() + 60_000;
    const signature = exportService.signDownload(jobId, expires);

    const res = await request
      .get(`/api/v1/escrows/export/${jobId}/download`)
      .query({ expires, signature });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toContain('escrow_id,status,client_address');
    expect(res.text).toContain('1,Active');
  });

  it('returns 410 for an expired signature', async () => {
    const jobId = await createCompletedJob();
    const expires = Date.now() - 1000;
    const signature = exportService.signDownload(jobId, expires);

    const res = await request
      .get(`/api/v1/escrows/export/${jobId}/download`)
      .query({ expires, signature });

    expect(res.status).toBe(410);
  });

  it('returns 403 for a tampered signature', async () => {
    const jobId = await createCompletedJob();
    const expires = Date.now() + 60_000;

    const res = await request
      .get(`/api/v1/escrows/export/${jobId}/download`)
      .query({ expires, signature: 'not-a-real-signature' });

    expect(res.status).toBe(403);
  });
});
