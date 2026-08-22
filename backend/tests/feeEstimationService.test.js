import { jest } from '@jest/globals';

jest.mock('../services/stellarService.js', () => ({
  simulateTransaction: jest.fn().mockResolvedValue({
    success: true,
    cost: { cpuInsns: '1000000', memBytes: '131072' },
  }),
  stellarService: {},
  default: {},
}));

jest.mock('../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

describe('feeEstimationService', () => {
  let svc;
  beforeAll(async () => { svc = await import('../services/feeEstimationService.js'); });
  beforeEach(() => svc.clearCache());

  test('estimateFee returns feeStroops and feeXLM', async () => {
    const result = await svc.estimateFee({ amount: '100', receiverAddress: 'GABC' });
    expect(result).toHaveProperty('feeStroops');
    expect(result).toHaveProperty('feeXLM');
    expect(typeof result.feeStroops).toBe('number');
    expect(result.feeStroops).toBeGreaterThan(0);
  });

  test('second call returns cached result', async () => {
    const { simulateTransaction } = await import('../services/stellarService.js');
    simulateTransaction.mockClear();
    const params = { amount: '50', receiverAddress: 'GXYZ' };
    await svc.estimateFee(params);
    await svc.estimateFee(params);
    expect(simulateTransaction).toHaveBeenCalledTimes(1);
  });

  test('feeXLM equals feeStroops / 10_000_000', async () => {
    const result = await svc.estimateFee({ amount: '200' });
    expect(result.feeXLM).toBeCloseTo(result.feeStroops / 10_000_000, 5);
  });

  test('expirationLedger is a number', async () => {
    const result = await svc.estimateFee({ amount: '10' });
    expect(typeof result.expirationLedger).toBe('number');
    expect(result.expirationLedger).toBeGreaterThan(0);
  });
});
