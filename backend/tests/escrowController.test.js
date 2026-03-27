import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/escrow.json'), 'utf8'));

const cacheMock = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
  invalidatePrefix: jest.fn(),
  size: jest.fn(),
};

const prismaMock = {
  $transaction: jest.fn(async (operations) => operations),
  escrow: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  milestone: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
};

jest.unstable_mockModule('../lib/cache.js', () => ({ default: cacheMock }));
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { default: escrowController } = await import('../api/controllers/escrowController.js');

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status: jest.fn().mockImplementation(function (code) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn().mockImplementation(function (payload) {
      this.body = payload;
      return this;
    }),
  };
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  cacheMock.get.mockReturnValue(null);
  // Default prisma transaction behavior
  prismaMock.$transaction.mockImplementation(async (ops) => {
    return Promise.all(ops);
  });
  prismaMock.escrow.findMany.mockResolvedValue([]);
  prismaMock.escrow.count.mockResolvedValue(0);
});

describe('escrowController', () => {
  describe('listEscrows', () => {
    it('returns 200 with paginated escrow list (cache miss)', async () => {
      const req = { query: { page: '1', limit: '10' } };
      const res = createMockRes();

      prismaMock.escrow.findMany.mockResolvedValue(fixtures.escrows);
      prismaMock.escrow.count.mockResolvedValue(fixtures.escrows.length);

      await escrowController.listEscrows(req, res);

      expect(res.json).toHaveBeenCalled();
      expect(res.body.data).toHaveLength(fixtures.escrows.length);
      expect(res.body.total).toBe(fixtures.escrows.length);
    });

    it('returns the normalized paginated response shape', async () => {
      const req = { query: {} };
      const res = createMockRes();

      await escrowController.listEscrows(req, res);

      expect(res.json).toHaveBeenCalledWith({
        data: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('applies status filter correctly', async () => {
      const req = { query: { status: 'Active,Completed' } };
      const res = createMockRes();

      prismaMock.escrow.findMany.mockResolvedValue([]);
      prismaMock.escrow.count.mockResolvedValue(0);

      await escrowController.listEscrows(req, res);

      expect(prismaMock.escrow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['Active', 'Completed'] },
          }),
        }),
      );
    });

    it('applies search filter correctly (numeric ID)', async () => {
      const req = { query: { search: '123' } };
      const res = createMockRes();

      await escrowController.listEscrows(req, res);

      expect(prismaMock.escrow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ id: 123n }]),
          }),
        }),
      );
    });

    it('applies amount range correctly', async () => {
      const req = { query: { minAmount: '100', maxAmount: '500' } };
      const res = createMockRes();

      await escrowController.listEscrows(req, res);

      expect(prismaMock.escrow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            totalAmount: { gte: '100', lte: '500' },
          }),
        }),
      );
    });

    it('returns 500 on error', async () => {
      const req = { query: {} };
      const res = createMockRes();
      prismaMock.$transaction.mockRejectedValue(new Error('DB Error'));

      await escrowController.listEscrows(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.body.error).toBe('DB Error');
    });
  });

  describe('getEscrow', () => {
    it('returns 200 with escrow details', async () => {
      const req = { params: { id: '1' } };
      const res = createMockRes();
      const escrow = fixtures.escrows[0];
      prismaMock.escrow.findUnique.mockResolvedValue(escrow);

      await escrowController.getEscrow(req, res);

      expect(res.json).toHaveBeenCalledWith(escrow);
    });

    it('returns 404 if escrow not found', async () => {
      const req = { params: { id: '999' } };
      const res = createMockRes();
      prismaMock.escrow.findUnique.mockResolvedValue(null);

      await escrowController.getEscrow(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 for invalid ID', async () => {
      const req = { params: { id: 'abc' } };
      const res = createMockRes();

      await escrowController.getEscrow(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.body.error).toBe('Invalid escrow id');
    });
  });

  describe('broadcastCreateEscrow', () => {
    it('returns 400 if signedXdr is missing', async () => {
      const req = { body: {} };
      const res = createMockRes();

      await escrowController.broadcastCreateEscrow(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 501 (not implemented)', async () => {
      const req = { body: { signedXdr: 'AAAA...' } };
      const res = createMockRes();

      await escrowController.broadcastCreateEscrow(req, res);

      expect(res.status).toHaveBeenCalledWith(501);
    });
  });

  describe('getMilestones', () => {
    it('returns 200 with milestones', async () => {
      const req = { params: { id: '1' }, query: {} };
      const res = createMockRes();
      prismaMock.milestone.findMany.mockResolvedValue(fixtures.milestones);
      prismaMock.milestone.count.mockResolvedValue(fixtures.milestones.length);

      await escrowController.getMilestones(req, res);

      expect(res.json).toHaveBeenCalled();
      expect(res.body.data).toHaveLength(fixtures.milestones.length);
    });

    it('returns 400 for invalid escrow ID', async () => {
      const req = { params: { id: 'abc' }, query: {} };
      const res = createMockRes();

      await escrowController.getMilestones(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getMilestone', () => {
    it('returns 200 with specific milestone', async () => {
      const req = { params: { id: '1', milestoneId: '0' } };
      const res = createMockRes();
      prismaMock.milestone.findUnique.mockResolvedValue(fixtures.milestones[0]);

      await escrowController.getMilestone(req, res);

      expect(res.json).toHaveBeenCalledWith(fixtures.milestones[0]);
    });

    it('returns 404 if milestone not found', async () => {
      const req = { params: { id: '1', milestoneId: '99' } };
      const res = createMockRes();
      prismaMock.milestone.findUnique.mockResolvedValue(null);

      await escrowController.getMilestone(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
