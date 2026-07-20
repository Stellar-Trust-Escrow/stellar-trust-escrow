import { jest } from '@jest/globals';

process.env.NODE_ENV = 'test';
process.env.SKIP_SIG_VERIFY = 'true';

// ── In-memory prisma mock ─────────────────────────────────────────────────────

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
    findUnique: jest.fn(async ({ where }) => {
      const r = findOne('approvalRequest', where);
      return r ? { ...r } : null;
    }),
    findFirst: jest.fn(async ({ where }) => {
      const r = db.approvalRequest.find((rec) =>
        Object.entries(where).every(([k, v]) => rec[k] === v),
      );
      return r ? { ...r } : null;
    }),
    findMany: jest.fn(async () => [...db.approvalRequest]),
    count: jest.fn(async () => db.approvalRequest.length),
    update: jest.fn(async ({ where, data }) => {
      const record = findOne('approvalRequest', where);
      if (!record) throw new Error('approvalRequest not found');
      if (data.approvalCount?.increment !== undefined) {
        record.approvalCount = (record.approvalCount || 0) + data.approvalCount.increment;
      } else {
        Object.assign(record, data);
      }
      // Apply other data fields (status, txHash, etc.)
      const { approvalCount: _ignored, ...rest } = data;
      if (data.approvalCount?.increment === undefined) {
        Object.assign(record, rest);
      } else {
        // merge remaining fields
        const { approvalCount: _a, ...remaining } = data;
        Object.assign(record, remaining);
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

const { createApprovalRequest, recordApproval, recordRejection, expireOverdueRequests } =
  await import('../../services/approvalWorkflowService.js');

const APPROVER_A = `G${'A'.repeat(55)}`;
const APPROVER_B = `G${'B'.repeat(55)}`;
const APPROVER_C = `G${'C'.repeat(55)}`;

function resetDb() {
  db.approvalRequest = [];
  db.approvalRecord = [];
  jest.clearAllMocks();
}

// ── createApprovalRequest ─────────────────────────────────────────────────────

describe('createApprovalRequest', () => {
  beforeEach(resetDb);

  it('stores the record in the DB', async () => {
    const future = new Date(Date.now() + 3600_000);
    const req = await createApprovalRequest({
      escrowId: 'esc-1',
      milestoneIndex: 0,
      requiredApprovers: [APPROVER_A, APPROVER_B],
      threshold: 2,
      deadlineAt: future,
      initiatedBy: APPROVER_A,
    });

    expect(req.escrowId).toBe('esc-1');
    expect(req.status).toBe('pending');
    expect(req.approvalCount).toBe(0);
    expect(db.approvalRequest).toHaveLength(1);
  });

  it('throws INVALID_THRESHOLD when threshold > approver count', async () => {
    const future = new Date(Date.now() + 3600_000);
    await expect(
      createApprovalRequest({
        escrowId: 'esc-2',
        milestoneIndex: 0,
        requiredApprovers: [APPROVER_A],
        threshold: 3,
        deadlineAt: future,
        initiatedBy: APPROVER_A,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_THRESHOLD', status: 400 });
  });
});

// ── recordApproval ────────────────────────────────────────────────────────────

describe('recordApproval', () => {
  let requestId;

  beforeEach(async () => {
    resetDb();
    const future = new Date(Date.now() + 3600_000);
    const req = await createApprovalRequest({
      escrowId: 'esc-1',
      milestoneIndex: 0,
      requiredApprovers: [APPROVER_A, APPROVER_B, APPROVER_C],
      threshold: 2,
      deadlineAt: future,
      initiatedBy: APPROVER_A,
    });
    requestId = req.id;
  });

  it('returns approved=true and threshold_reached=false before threshold', async () => {
    const result = await recordApproval(requestId, APPROVER_A, 'sig');
    expect(result).toMatchObject({ approved: true, threshold_reached: false });
  });

  it('sets status=approved when count reaches threshold', async () => {
    await recordApproval(requestId, APPROVER_A, 'sig');
    const result = await recordApproval(requestId, APPROVER_B, 'sig');
    expect(result.threshold_reached).toBe(true);
    const req = db.approvalRequest.find((r) => r.id === requestId);
    expect(req.status).toBe('approved');
  });

  it('throws NOT_IN_APPROVER_LIST (403) for unknown address', async () => {
    await expect(recordApproval(requestId, `G${'Z'.repeat(55)}`, 'sig')).rejects.toMatchObject({
      code: 'NOT_IN_APPROVER_LIST',
      status: 403,
    });
  });

  it('throws ALREADY_APPROVED (409) on double vote', async () => {
    await recordApproval(requestId, APPROVER_A, 'sig');
    await expect(recordApproval(requestId, APPROVER_A, 'sig')).rejects.toMatchObject({
      code: 'ALREADY_APPROVED',
      status: 409,
    });
  });

  it('throws REQUEST_EXPIRED (409) when deadline has passed', async () => {
    // Manually set deadline to past
    const req = db.approvalRequest.find((r) => r.id === requestId);
    req.deadlineAt = new Date(Date.now() - 1000);

    await expect(recordApproval(requestId, APPROVER_A, 'sig')).rejects.toMatchObject({
      code: 'REQUEST_EXPIRED',
      status: 409,
    });
  });
});

// ── recordRejection ───────────────────────────────────────────────────────────

describe('recordRejection', () => {
  let requestId;

  beforeEach(async () => {
    resetDb();
    const future = new Date(Date.now() + 3600_000);
    const req = await createApprovalRequest({
      escrowId: 'esc-1',
      milestoneIndex: 0,
      requiredApprovers: [APPROVER_A, APPROVER_B],
      threshold: 2,
      deadlineAt: future,
      initiatedBy: APPROVER_A,
    });
    requestId = req.id;
  });

  it('sets status=rejected and returns request', async () => {
    const result = await recordRejection(requestId, APPROVER_A, 'not satisfied');
    expect(result.status).toBe('rejected');
    const req = db.approvalRequest.find((r) => r.id === requestId);
    expect(req.status).toBe('rejected');
  });

  it('throws NOT_IN_APPROVER_LIST for unknown address', async () => {
    await expect(recordRejection(requestId, `G${'Z'.repeat(55)}`, 'no')).rejects.toMatchObject({
      code: 'NOT_IN_APPROVER_LIST',
      status: 403,
    });
  });
});

// ── expireOverdueRequests ─────────────────────────────────────────────────────

describe('expireOverdueRequests', () => {
  beforeEach(resetDb);

  it('marks overdue pending requests as expired', async () => {
    // Create two requests: one overdue, one future
    const past = new Date(Date.now() - 1000);
    const future = new Date(Date.now() + 3600_000);

    db.approvalRequest.push(
      { id: 'r-past', status: 'pending', deadlineAt: past, approvalCount: 0 },
      { id: 'r-future', status: 'pending', deadlineAt: future, approvalCount: 0 },
    );

    const count = await expireOverdueRequests();
    expect(count).toBe(1);
    expect(db.approvalRequest.find((r) => r.id === 'r-past').status).toBe('expired');
    expect(db.approvalRequest.find((r) => r.id === 'r-future').status).toBe('pending');
  });
});
