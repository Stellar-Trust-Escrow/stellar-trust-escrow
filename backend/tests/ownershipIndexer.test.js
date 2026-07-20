import { jest } from '@jest/globals';

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

const prismaMock = {
  $transaction: jest.fn(),
  escrowOwnership: { upsert: jest.fn() },
  ownershipTransferLog: { create: jest.fn() },
};
jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const mockGetEvents = jest.fn();
jest.unstable_mockModule('@stellar/stellar-sdk', () => ({
  SorobanRpc: {
    Server: jest.fn(() => ({ getEvents: mockGetEvents })),
  },
  scValToNative: jest.fn((v) => v),
}));

const { applyTransferAccepted, pollOwnershipEvents } = await import('../services/ownershipIndexer.js');

describe('applyTransferAccepted', () => {
  beforeEach(() => jest.clearAllMocks());

  it('upserts EscrowOwnership and creates transfer log in a transaction', async () => {
    prismaMock.$transaction.mockResolvedValue([]);

    await applyTransferAccepted({
      escrowId: 'esc-1',
      from: 'GFROM',
      to: 'GTO',
      txHash: 'abc123',
      ledger: 100,
    });

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const [ops] = prismaMock.$transaction.mock.calls[0];
    expect(ops).toHaveLength(2);
  });
});

describe('pollOwnershipEvents', () => {
  beforeEach(() => jest.clearAllMocks());

  it('skips polling when OWNERSHIP_CONTRACT_ID is not set', async () => {
    delete process.env.OWNERSHIP_CONTRACT_ID;
    await pollOwnershipEvents(1000);
    expect(mockGetEvents).not.toHaveBeenCalled();
  });

  it('processes TransferAccepted events and stops when fewer than limit returned', async () => {
    process.env.OWNERSHIP_CONTRACT_ID = 'CCONTRACT';
    prismaMock.$transaction.mockResolvedValue([]);

    mockGetEvents.mockResolvedValue({
      events: [
        {
          topic: ['own_acc', '42'],
          value: ['GFROM', 'GTO'],
          txHash: 'tx1',
          ledger: '200',
        },
      ],
      cursor: null,
    });

    await pollOwnershipEvents(1000);

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });
});
