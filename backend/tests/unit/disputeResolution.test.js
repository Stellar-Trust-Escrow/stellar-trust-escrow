import { jest } from '@jest/globals';

// ── Mock logger ───────────────────────────────────────────────────────────────
jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ── Mock prisma ───────────────────────────────────────────────────────────────
const disputeStore = [];
const evidenceStore = [];
const rulingStore = [];
const appealStore = [];
let _idSeq = 1;

const prismaMock = {
  dispute: {
    create: jest.fn(async ({ data }) => {
      const record = { id: _idSeq++, ...data };
      disputeStore.push(record);
      return { ...record };
    }),
    findFirst: jest.fn(async ({ where }) => {
      return (
        disputeStore.find((d) => {
          if (where.id !== undefined && d.id !== where.id) return false;
          if (where.tenantId !== undefined && d.tenantId !== where.tenantId) return false;
          return true;
        }) ?? null
      );
    }),
    update: jest.fn(async ({ where, data }) => {
      const idx = disputeStore.findIndex((d) => d.id === where.id);
      if (idx === -1) throw new Error('dispute.update: not found');
      Object.assign(disputeStore[idx], data);
      return { ...disputeStore[idx] };
    }),
    updateMany: jest.fn(async ({ where, data }) => {
      let count = 0;
      for (const d of disputeStore) {
        const matchId = where.id === undefined || d.id === where.id;
        const matchStatus = where.status === undefined || d.status === where.status;
        if (matchId && matchStatus) {
          Object.assign(d, data);
          count++;
        }
      }
      return { count };
    }),
    count: jest.fn(async ({ where }) => {
      return disputeStore.filter((d) => {
        if (where?.tenantId && d.tenantId !== where.tenantId) return false;
        if (where?.status && d.status !== where.status) return false;
        return true;
      }).length;
    }),
    findMany: jest.fn(async () => [...disputeStore]),
  },
  disputeEvidence: {
    create: jest.fn(async ({ data }) => {
      const record = { id: _idSeq++, ...data };
      evidenceStore.push(record);
      return { ...record };
    }),
    count: jest.fn(async ({ where }) => {
      return evidenceStore.filter((e) => {
        if (where?.disputeId !== undefined && e.disputeId !== where.disputeId) return false;
        if (where?.submittedBy && e.submittedBy !== where.submittedBy) return false;
        return true;
      }).length;
    }),
  },
  disputeRuling: {
    create: jest.fn(async ({ data }) => {
      const record = { id: _idSeq++, ...data };
      rulingStore.push(record);
      return { ...record };
    }),
  },
  disputeAppeal: {
    create: jest.fn(async ({ data }) => {
      const record = { id: _idSeq++, ...data };
      appealStore.push(record);
      return { ...record };
    }),
  },
};

jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: prismaMock }));

// ── Mock disputeTimerQueue ────────────────────────────────────────────────────
jest.unstable_mockModule('../../queues/disputeTimerQueue.js', () => ({
  scheduleEvidenceExpiry: jest.fn().mockResolvedValue({ id: 'timer-1' }),
  scheduleAppealExpiry: jest.fn().mockResolvedValue({ id: 'timer-2' }),
}));

const { openDispute, assignArbiter, submitRuling, fileAppeal, finalizeDispute } =
  await import('../../services/disputeResolution.js');

beforeEach(() => {
  jest.clearAllMocks();
  disputeStore.length = 0;
  evidenceStore.length = 0;
  rulingStore.length = 0;
  appealStore.length = 0;
  _idSeq = 1;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('openDispute', () => {
  it('creates a dispute with status evidence_collection', async () => {
    const dispute = await openDispute({
      escrowId: 42n,
      milestoneIndex: 0,
      reason: 'Work not delivered',
      evidenceHash: null,
      raisedByAddress: 'GCLIENT',
      tenantId: 'tenant-1',
    });

    expect(dispute.status).toBe('evidence_collection');
    expect(dispute.tenantId).toBe('tenant-1');
    expect(dispute.raisedByAddress).toBe('GCLIENT');
    expect(dispute.evidenceDeadlineAt).toBeInstanceOf(Date);
  });
});

describe('submitRuling', () => {
  it('throws INVALID_SPLIT when clientPct + freelancerPct !== 100', async () => {
    // Set up a dispute in arbiter_review
    disputeStore.push({
      id: 10,
      tenantId: 'tenant-1',
      status: 'arbiter_review',
      arbiter: 'GARBITER',
    });

    await expect(
      submitRuling({
        disputeId: 10,
        arbiterAddress: 'GARBITER',
        clientPct: 60,
        freelancerPct: 60,
        reasoning: 'Both at fault',
        tenantId: 'tenant-1',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SPLIT', status: 422 });
  });

  it('creates a ruling when split is valid', async () => {
    disputeStore.push({
      id: 11,
      tenantId: 'tenant-1',
      status: 'arbiter_review',
      arbiter: 'GARBITER',
    });

    const ruling = await submitRuling({
      disputeId: 11,
      arbiterAddress: 'GARBITER',
      clientPct: 70,
      freelancerPct: 30,
      reasoning: 'Client did not provide feedback',
      tenantId: 'tenant-1',
    });

    expect(ruling).toBeDefined();
    expect(ruling.clientPct).toBe(70);
    expect(ruling.freelancerPct).toBe(30);
  });
});

describe('fileAppeal', () => {
  it('throws NOT_IN_APPEAL_WINDOW when status is not appeal_window or ruled', async () => {
    disputeStore.push({
      id: 20,
      tenantId: 'tenant-1',
      status: 'final',
    });

    await expect(
      fileAppeal({
        disputeId: 20,
        groundsText: 'Arbiter was biased',
        evidenceHash: null,
        appellantAddress: 'GCLIENT',
        tenantId: 'tenant-1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_IN_APPEAL_WINDOW', status: 409 });
  });

  it('creates an appeal when status is ruled', async () => {
    disputeStore.push({
      id: 21,
      tenantId: 'tenant-1',
      status: 'ruled',
    });

    const appeal = await fileAppeal({
      disputeId: 21,
      groundsText: 'Incorrect ruling',
      evidenceHash: null,
      appellantAddress: 'GCLIENT',
      tenantId: 'tenant-1',
    });

    expect(appeal).toBeDefined();
    expect(appeal.appealedBy).toBe('GCLIENT');
  });
});

describe('finalizeDispute', () => {
  it('is a no-op (does not throw) when dispute is already final', async () => {
    disputeStore.push({
      id: 30,
      tenantId: 'tenant-1',
      status: 'final',
    });

    await expect(finalizeDispute({ disputeId: 30, tenantId: 'tenant-1' })).resolves.not.toThrow();

    // Status should remain 'final' unchanged
    expect(disputeStore[0].status).toBe('final');
  });

  it('transitions status to final when dispute is in ruled state', async () => {
    disputeStore.push({
      id: 31,
      tenantId: 'tenant-1',
      status: 'ruled',
    });

    const result = await finalizeDispute({ disputeId: 31, tenantId: 'tenant-1' });
    expect(result.status).toBe('final');
  });
});
