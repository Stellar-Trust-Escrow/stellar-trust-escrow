import { jest } from '@jest/globals';

const cacheMock = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
  invalidatePrefix: jest.fn(),
  size: jest.fn(),
};

const prismaMock = {
  $transaction: jest.fn(async (operations) => Promise.all(operations)),
  escrow: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  milestone: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  dispute: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  reputationRecord: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: escrowController } = await import('../api/controllers/escrowController.js');
const { default: userController } = await import('../api/controllers/userController.js');
const { default: disputeController } = await import('../api/controllers/disputeController.js');
const { default: reputationController } =
  await import('../api/controllers/reputationController.js');

function createResponse() {
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

beforeEach(() => {
  jest.clearAllMocks();
  cacheMock.get.mockReturnValue(null);
});

describe('pagination standardization', () => {
  it('returns standardized metadata for escrow listings', async () => {
    prismaMock.escrow.findMany.mockResolvedValue([{ id: 1 }]);
    prismaMock.escrow.count.mockResolvedValue(45);

    const res = createResponse();
    await escrowController.listEscrows({ query: {} }, res);

    expect(prismaMock.escrow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      data: [{ id: 1 }],
      page: 1,
      limit: 20,
      total: 45,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it('normalizes invalid page values and clamps oversized limits', async () => {
    prismaMock.escrow.findMany.mockResolvedValue([]);
    prismaMock.escrow.count.mockResolvedValue(0);

    const res = createResponse();
    await escrowController.listEscrows({ query: { page: '-9', limit: '500' } }, res);

    expect(prismaMock.escrow.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 100,
      }),
    );
    expect(res.body).toMatchObject({
      page: 1,
      limit: 100,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it('applies standardized pagination to user escrow filters', async () => {
    const address = `G${'A'.repeat(55)}`;
    prismaMock.escrow.findMany.mockResolvedValue([{ id: 2 }]);
    prismaMock.escrow.count.mockResolvedValue(8);

    const res = createResponse();
    await userController.getUserEscrows(
      {
        params: { address },
        query: { role: 'client', status: 'Completed', page: '2', limit: '5' },
      },
      res,
    );

    expect(prismaMock.escrow.count).toHaveBeenCalledWith({
      where: { status: 'Completed', clientAddress: address },
    });
    expect(res.body).toMatchObject({
      page: 2,
      limit: 5,
      total: 8,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  it('paginates milestone collections with the same response shape', async () => {
    prismaMock.milestone.findMany.mockResolvedValue([{ milestoneIndex: 1 }]);
    prismaMock.milestone.count.mockResolvedValue(3);

    const res = createResponse();
    await escrowController.getMilestones(
      {
        params: { id: '7' },
        query: { page: '2', limit: '2' },
      },
      res,
    );

    expect(prismaMock.milestone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { escrowId: 7n },
        skip: 2,
        take: 2,
      }),
    );
    expect(res.body).toMatchObject({
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  it('keeps dispute and leaderboard pagination metadata aligned', async () => {
    prismaMock.dispute.findMany.mockResolvedValue([{ escrowId: 1 }]);
    prismaMock.dispute.count.mockResolvedValue(6);
    prismaMock.reputationRecord.findMany.mockResolvedValue([
      {
        address: `G${'B'.repeat(55)}`,
        totalScore: 99,
        completedEscrows: 4,
        disputesWon: 1,
        totalVolume: '50',
      },
    ]);
    prismaMock.reputationRecord.count.mockResolvedValue(5);

    const disputesRes = createResponse();
    await disputeController.listDisputes({ query: { page: '2', limit: '4' } }, disputesRes);

    const leaderboardRes = createResponse();
    await reputationController.getLeaderboard({ query: { page: '2', limit: '2' } }, leaderboardRes);

    expect(disputesRes.body).toMatchObject({
      page: 2,
      limit: 4,
      total: 6,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
    expect(leaderboardRes.body).toMatchObject({
      page: 2,
      limit: 2,
      total: 5,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(leaderboardRes.body.data[0]).toMatchObject({
      rank: 3,
      fullAddress: `G${'B'.repeat(55)}`,
    });
  });
});
