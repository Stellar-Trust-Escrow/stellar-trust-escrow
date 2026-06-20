import { jest } from '@jest/globals';

const prismaMock = {
  escrow: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRawUnsafe: jest.fn(),
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));
const archiveService = await import('../services/escrowArchiveService.js');
jest.unstable_mockModule('../services/escrowArchiveService.js', () => ({
  ...archiveService,
  listArchiveTables: jest.fn(async () => ['escrows_archive_2025_01']),
}));

const { default: searchService } = await import('../services/searchService.js');
const { archiveCompletedEscrows, getArchiveTableName } = archiveService;

describe('escrowArchiveService', () => {
  it('creates stable monthly archive table names', () => {
    expect(getArchiveTableName('2025-03-15T12:00:00.000Z')).toBe('escrows_archive_2025_03');
  });

  it('archives completed rows older than the retention horizon', async () => {
    const archivePrisma = {
      escrow: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 7n, createdAt: new Date('2024-03-01T00:00:00.000Z') }]),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    };

    await archiveCompletedEscrows(archivePrisma, new Date('2025-01-01T00:00:00.000Z'));

    expect(archivePrisma.escrow.findMany).toHaveBeenCalled();
    expect(archivePrisma.$executeRawUnsafe).toHaveBeenCalled();
  });
});

describe('searchService archive fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to archive tables when live escrow rows are exhausted', async () => {
    prismaMock.$transaction.mockResolvedValue([[], 0]);
    prismaMock.$queryRawUnsafe.mockResolvedValue([
      {
        id: 42n,
        clientAddress: 'GARCHIVE_CLIENT',
        freelancerAddress: 'GARCHIVE_FREELANCER',
        status: 'Completed',
        totalAmount: '250',
        createdAt: '2025-03-01T00:00:00.000Z',
      },
    ]);

    const result = await searchService.search({ q: 'archive', page: 1, limit: 10 });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(42n);
    expect(prismaMock.$queryRawUnsafe).toHaveBeenCalled();
  });
});
