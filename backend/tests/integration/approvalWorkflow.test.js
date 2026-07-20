import { jest } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';

process.env.NODE_ENV = 'test';
process.env.SKIP_SIG_VERIFY = 'true';

const APPROVER_A = `G${'A'.repeat(55)}`;
const APPROVER_B = `G${'B'.repeat(55)}`;
const OUTSIDER = `G${'Z'.repeat(55)}`;

// ── In-memory store ───────────────────────────────────────────────────────────

const db = {
  approvalRequest: [],
  approvalRecord: [],
};

function findOne(table, where) {
  return db[table].find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null;
}

const prismaMock = {
  approvalRequest: {
    create: jest.fn(async ({ data }) => {
      const record = { approvalCount: 0, status: 'pending', txHash: null, ...data };
      db.approvalRequest.push(record);
      return { ...record };
    }),
    findUnique: jest.fn(async ({ where, include }) => {
      const r = findOne('approvalRequest', where);
      if (!r) return null;
      const result = { ...r };
      if (include?.records) {
        result.records = db.approvalRecord.filter((rec) => rec.requestId === r.id);
      }
      return result;
    }),
    findFirst: jest.fn(async ({ where }) => {
      const r = db.approvalRequest.find((rec) =>
        Object.entries(where).every(([k, v]) => rec[k] === v),
      );
      return r ? { ...r } : null;
    }),
    findMany: jest.fn(async ({ where, skip = 0, take = 20 } = {}) => {
      let records = [...db.approvalRequest];
      if (where) {
        records = records.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
      }
      return records.slice(skip, skip + take);
    }),
    count: jest.fn(async () => db.approvalRequest.length),
    update: jest.fn(async ({ where, data }) => {
      const record = findOne('approvalRequest', where);
      if (!record) throw new Error('approvalRequest not found');
      if (data.approvalCount?.increment !== undefined) {
        record.approvalCount = (record.approvalCount || 0) + data.approvalCount.increment;
        const { approvalCount: _a, ...remaining } = data;
        Object.assign(record, remaining);
      } else {
        Object.assign(record, data);
      }
      return { ...record };
    }),
    updateMany: jest.fn(async ({ where, data }) => {
      let count = 0;
      for (const r of db.approvalRequest) {
        const matches = Object.entries(where).every(([k, v]) => {
          if (v && typeof v === 'object' && 'lt' in v) return r[k] < v.lt;
          return r[k] === v;
        });
        if (matches) {
          Object.assign(r, data);
          count++;
        }
      }
      return { count };
    }),
  },
  approvalRecord: {
    create: jest.fn(async ({ data }) => {
      const record = { ...data };
      db.approvalRecord.push(record);
      return { ...record };
    }),
    findFirst: jest.fn(async ({ where }) => {
      const r = db.approvalRecord.find((rec) =>
        Object.entries(where).every(([k, v]) => rec[k] === v),
      );
      return r ? { ...r } : null;
    }),
  },
};

jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: prismaMock }));

jest.unstable_mockModule('../../queues/approvalQueue.js', () => ({
  scheduleExpiry: jest.fn().mockResolvedValue({ id: 'job-1' }),
  approvalQueue: { add: jest.fn(), __resetForTests: jest.fn() },
  __resetForTests: jest.fn(),
}));

jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  Keypair: {
    fromPublicKey: jest.fn(() => ({ verify: jest.fn().mockReturnValue(true) })),
  },
}));

// Mock auth middleware: inject caller as APPROVER_A by default
jest.unstable_mockModule('../../api/middleware/auth.js', () => ({
  default: (req, _res, next) => {
    req.user = { stellarAddress: req.headers['x-approver'] || APPROVER_A };
    next();
  },
}));

const { default: approvalRoutes } = await import('../../api/routes/approvalRoutes.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/approvals', approvalRoutes);
  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetDb() {
  db.approvalRequest = [];
  db.approvalRecord = [];
  jest.clearAllMocks();
  // Re-bind mocks so cleared fns still work
  prismaMock.approvalRequest.create.mockImplementation(async ({ data }) => {
    const record = { approvalCount: 0, status: 'pending', txHash: null, ...data };
    db.approvalRequest.push(record);
    return { ...record };
  });
  prismaMock.approvalRequest.findUnique.mockImplementation(async ({ where, include }) => {
    const r = findOne('approvalRequest', where);
    if (!r) return null;
    const result = { ...r };
    if (include?.records) {
      result.records = db.approvalRecord.filter((rec) => rec.requestId === r.id);
    }
    return result;
  });
  prismaMock.approvalRequest.findFirst.mockImplementation(async ({ where }) => {
    const r = db.approvalRequest.find((rec) =>
      Object.entries(where).every(([k, v]) => rec[k] === v),
    );
    return r ? { ...r } : null;
  });
  prismaMock.approvalRequest.findMany.mockImplementation(
    async ({ where, skip = 0, take = 20 } = {}) => {
      let records = [...db.approvalRequest];
      if (where) {
        records = records.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
      }
      return records.slice(skip, skip + take);
    },
  );
  prismaMock.approvalRequest.count.mockImplementation(async () => db.approvalRequest.length);
  prismaMock.approvalRequest.update.mockImplementation(async ({ where, data }) => {
    const record = findOne('approvalRequest', where);
    if (!record) throw new Error('approvalRequest not found');
    if (data.approvalCount?.increment !== undefined) {
      record.approvalCount = (record.approvalCount || 0) + data.approvalCount.increment;
      const { approvalCount: _a, ...remaining } = data;
      Object.assign(record, remaining);
    } else {
      Object.assign(record, data);
    }
    return { ...record };
  });
  prismaMock.approvalRecord.create.mockImplementation(async ({ data }) => {
    const record = { ...data };
    db.approvalRecord.push(record);
    return { ...record };
  });
  prismaMock.approvalRecord.findFirst.mockImplementation(async ({ where }) => {
    const r = db.approvalRecord.find((rec) =>
      Object.entries(where).every(([k, v]) => rec[k] === v),
    );
    return r ? { ...r } : null;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let request;

beforeEach(() => {
  resetDb();
  request = supertest(buildApp());
});

describe('POST /api/v1/approvals', () => {
  it('returns 201 and creates a request', async () => {
    const deadline = new Date(Date.now() + 3600_000).toISOString();
    const res = await request.post('/api/v1/approvals').send({
      escrowId: 'esc-1',
      milestoneIndex: 0,
      requiredApprovers: [APPROVER_A, APPROVER_B],
      threshold: 2,
      deadlineAt: deadline,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(db.approvalRequest).toHaveLength(1);
  });
});

describe('GET /api/v1/approvals/:requestId', () => {
  it('returns 200 with the request', async () => {
    // Seed a request
    const id = 'req-123';
    db.approvalRequest.push({
      id,
      escrowId: 'esc-1',
      milestoneIndex: 0,
      requiredApprovers: [APPROVER_A],
      threshold: 1,
      approvalCount: 0,
      status: 'pending',
      initiatedBy: APPROVER_A,
      deadlineAt: new Date(Date.now() + 3600_000),
    });

    const res = await request.get(`/api/v1/approvals/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it('returns 404 for unknown request', async () => {
    const res = await request.get('/api/v1/approvals/does-not-exist');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/approvals/:requestId/approve', () => {
  let requestId;

  beforeEach(async () => {
    const deadline = new Date(Date.now() + 3600_000).toISOString();
    const res = await request.post('/api/v1/approvals').send({
      escrowId: 'esc-1',
      milestoneIndex: 0,
      requiredApprovers: [APPROVER_A, APPROVER_B],
      threshold: 2,
      deadlineAt: deadline,
    });
    requestId = res.body.id;
  });

  it('returns 403 when caller is not in approver list', async () => {
    const res = await request
      .post(`/api/v1/approvals/${requestId}/approve`)
      .set('x-approver', OUTSIDER)
      .send({ signatureProof: 'sig' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_IN_APPROVER_LIST');
  });

  it('returns 409 on double approve', async () => {
    await request
      .post(`/api/v1/approvals/${requestId}/approve`)
      .set('x-approver', APPROVER_A)
      .send({ signatureProof: 'sig' });

    const res = await request
      .post(`/api/v1/approvals/${requestId}/approve`)
      .set('x-approver', APPROVER_A)
      .send({ signatureProof: 'sig' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_APPROVED');
  });
});

describe('POST /api/v1/approvals/:requestId/reject', () => {
  let requestId;

  beforeEach(async () => {
    const deadline = new Date(Date.now() + 3600_000).toISOString();
    const res = await request.post('/api/v1/approvals').send({
      escrowId: 'esc-1',
      milestoneIndex: 0,
      requiredApprovers: [APPROVER_A, APPROVER_B],
      threshold: 2,
      deadlineAt: deadline,
    });
    requestId = res.body.id;
  });

  it('returns 200 with status=rejected', async () => {
    const res = await request
      .post(`/api/v1/approvals/${requestId}/reject`)
      .set('x-approver', APPROVER_A)
      .send({ reason: 'milestone not complete' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
  });
});
