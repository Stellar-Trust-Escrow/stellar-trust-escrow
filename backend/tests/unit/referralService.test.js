/**
 * Tests for services/referralService.js
 *
 * Verifies:
 *  - calculateEarning is a no-op when no referrer is bound on-chain
 *  - earning = totalAmount * platformFeePercent/100 * referralPercent/100
 *    (both percentages read from config, never hardcoded)
 *  - calculateEarning never throws — failures degrade to null so a release
 *    is never blocked by referral accounting
 *  - getMyStats aggregates pending vs. paid earnings correctly
 */

import { jest } from '@jest/globals';

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => loggerMock,
}));

const getReferrerOnChainMock = jest.fn();
jest.unstable_mockModule('../../services/referralRegistryClient.js', () => ({
  getReferrerOnChain: getReferrerOnChainMock,
  default: { getReferrerOnChain: getReferrerOnChainMock },
}));

const prismaMock = {
  referralCode: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  referralEarning: {
    upsert: jest.fn(),
    aggregate: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  escrow: {
    findUnique: jest.fn(),
  },
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: prismaMock }));

let referralService;

beforeAll(async () => {
  referralService = await import('../../services/referralService.js');
});

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.PLATFORM_FEE_PERCENT;
  delete process.env.REFERRAL_EARNINGS_PERCENT;
});

describe('calculateEarning', () => {
  it('is a no-op when no referrer is bound on-chain', async () => {
    getReferrerOnChainMock.mockResolvedValue(null);

    const result = await referralService.calculateEarning(1n);

    expect(result).toBeNull();
    expect(prismaMock.referralEarning.upsert).not.toHaveBeenCalled();
  });

  it('computes earning as totalAmount * feePct/100 * referralPct/100', async () => {
    process.env.PLATFORM_FEE_PERCENT = '2'; // 2%
    process.env.REFERRAL_EARNINGS_PERCENT = '20'; // 20% of the fee

    getReferrerOnChainMock.mockResolvedValue('GREFERRER...');
    prismaMock.referralCode.findFirst.mockResolvedValue({ code: 'ALICE1' });
    // 1000 XLM escrow (in stroops: 1000 * 1e7)
    prismaMock.escrow.findUnique.mockResolvedValue({ id: 1n, totalAmount: String(1000n * 10_000_000n) });
    prismaMock.referralEarning.upsert.mockResolvedValue({ id: 'e1' });
    prismaMock.referralCode.update.mockResolvedValue({});

    await referralService.calculateEarning(1n, 'release');

    // platform_fee = 1000 * 0.02 = 20 XLM; referral_earning = 20 * 0.20 = 4 XLM
    const upsertArg = prismaMock.referralEarning.upsert.mock.calls[0][0];
    expect(upsertArg.create.earnedXlm).toBe('4.0000000');
    expect(upsertArg.create.referralCode).toBe('ALICE1');
    expect(upsertArg.create.triggeredByEvent).toBe('release');
  });

  it('is idempotent via the (code, escrow, event) unique constraint (upsert, not create)', async () => {
    process.env.PLATFORM_FEE_PERCENT = '1.5';
    getReferrerOnChainMock.mockResolvedValue('GREFERRER...');
    prismaMock.referralCode.findFirst.mockResolvedValue({ code: 'ALICE1' });
    prismaMock.escrow.findUnique.mockResolvedValue({ id: 2n, totalAmount: String(500n * 10_000_000n) });
    prismaMock.referralEarning.upsert.mockResolvedValue({ id: 'e2' });
    prismaMock.referralCode.update.mockResolvedValue({});

    await referralService.calculateEarning(2n, 'release');

    expect(prismaMock.referralEarning.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          referralCode_escrowId_triggeredByEvent: {
            referralCode: 'ALICE1',
            escrowId: 2n,
            triggeredByEvent: 'release',
          },
        },
        update: {},
      }),
    );
  });

  it('never throws — returns null and logs on any failure', async () => {
    getReferrerOnChainMock.mockRejectedValue(new Error('RPC down'));

    await expect(referralService.calculateEarning(3n)).resolves.toBeNull();
    expect(loggerMock.error).toHaveBeenCalled();
  });
});

describe('getMyStats', () => {
  it('returns null when the user has no referral code', async () => {
    prismaMock.referralCode.findFirst.mockResolvedValue(null);
    const stats = await referralService.getMyStats(42);
    expect(stats).toBeNull();
  });

  it('aggregates pending vs. paid earnings separately', async () => {
    prismaMock.referralCode.findFirst.mockResolvedValue({ code: 'BOB1', totalReferrals: 3 });
    prismaMock.referralEarning.aggregate
      .mockResolvedValueOnce({ _sum: { earnedXlm: { toString: () => '12.5' } } }) // pending
      .mockResolvedValueOnce({ _sum: { earnedXlm: { toString: () => '40.0' } } }); // paid
    prismaMock.referralEarning.findMany.mockResolvedValue([
      { escrowId: 10n, earnedXlm: { toString: () => '5.0' } },
    ]);

    const stats = await referralService.getMyStats(1);

    expect(stats.code).toBe('BOB1');
    expect(stats.pendingEarnings).toBe('12.5');
    expect(stats.totalEarned).toBe('40.0');
    expect(stats.topReferred).toEqual([{ escrowId: '10', earnedXlm: '5.0' }]);
  });
});
