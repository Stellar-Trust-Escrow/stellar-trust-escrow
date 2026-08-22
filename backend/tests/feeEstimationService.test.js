import { describe, test, expect, beforeEach, jest } from '@jest/globals';

jest.unstable_mockModule('../services/stellarService.js', () => ({
  simulateTransaction: jest.fn().mockResolvedValue({
    success: true,
    cost: { cpuInsns: '1000000', memBytes: '131072' },
  }),
  submitTransaction: jest.fn(),
  getContractEvents: jest.fn(),
  getLatestLedger: jest.fn(),
  getStellarCircuitState: jest.fn(),
  STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
  default: {},
}));

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

describe('feeEstimationService', () => {
  let svc;
  beforeEach(async () => {
    jest.resetModules();
    svc = await import('../services/feeEstimationService.js');
    svc.clearCache();
  });

  test('estimateFee returns feeStroops and feeXLM', async () => {
    const result = await svc.estimateFee({ amount: '100', receiverAddress: 'GABC' });
    expect(result).toHaveProperty('feeStroops');
    expect(result).toHaveProperty('feeXLM');
    expect(typeof result.feeStroops).toBe('number');
    expect(result.feeStroops).toBeGreaterThan(0);
  });

  test('feeXLM equals feeStroops divided by 10_000_000', async () => {
    const result = await svc.estimateFee({ amount: '200' });
    expect(result.feeXLM).toBeCloseTo(result.feeStroops / 10_000_000, 5);
  });

  test('returns expirationLedger', async () => {
    const result = await svc.estimateFee({ amount: '50' });
    expect(result).toHaveProperty('expirationLedger');
    expect(typeof result.expirationLedger).toBe('number');
  });
});
