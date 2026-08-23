import { jest } from '@jest/globals';

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
  logControllerError: jest.fn(),
}));

const prismaMock = {
  contractEvent: { findMany: jest.fn() },
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('../../lib/cache.js', () => ({
  default: { get: jest.fn(), set: jest.fn() },
}));
jest.unstable_mockModule('../../lib/pagination.js', () => ({
  buildPaginatedResponse: jest.fn(),
  parsePagination: jest.fn(),
}));

let eventController;

beforeAll(async () => {
  eventController = (await import('../../api/controllers/eventController.js')).default;
});

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

beforeEach(() => jest.clearAllMocks());

describe('getEscrowIdsByTxHashes', () => {
  it('returns an empty map for an empty hashes param', async () => {
    const res = mockRes();
    await eventController.getEscrowIdsByTxHashes({ query: { hashes: '' } }, res);
    expect(res.json).toHaveBeenCalledWith({ map: {} });
    expect(prismaMock.contractEvent.findMany).not.toHaveBeenCalled();
  });

  it('maps tx hashes to escrow ids, stringifying BigInt', async () => {
    prismaMock.contractEvent.findMany.mockResolvedValue([
      { txHash: 'hashA', escrowId: 42n },
      { txHash: 'hashB', escrowId: 7n },
    ]);
    const res = mockRes();

    await eventController.getEscrowIdsByTxHashes({ query: { hashes: 'hashA,hashB,hashC' } }, res);

    expect(res.json).toHaveBeenCalledWith({ map: { hashA: '42', hashB: '7' } });
  });

  it('caps the number of hashes at 200', async () => {
    prismaMock.contractEvent.findMany.mockResolvedValue([]);
    const manyHashes = Array.from({ length: 250 }, (_, i) => `h${i}`).join(',');
    const res = mockRes();

    await eventController.getEscrowIdsByTxHashes({ query: { hashes: manyHashes } }, res);

    const whereArg = prismaMock.contractEvent.findMany.mock.calls[0][0].where.txHash.in;
    expect(whereArg).toHaveLength(200);
  });
});
