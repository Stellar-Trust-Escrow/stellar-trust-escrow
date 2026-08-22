import { jest } from '@jest/globals';

jest.unstable_mockModule('../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const { getSupportedAssets, validateAsset, getXLMEquivalent, findAsset, SUPPORTED_ASSETS } =
  await import('../services/assetService.js');

describe('assetService', () => {
  test('getSupportedAssets returns array including XLM', () => {
    const assets = getSupportedAssets();
    expect(Array.isArray(assets)).toBe(true);
    expect(assets.some((a) => a.code === 'XLM' && a.native)).toBe(true);
  });

  test('getSupportedAssets includes USDC with issuer', () => {
    const usdc = getSupportedAssets().find((a) => a.code === 'USDC');
    expect(usdc).toBeDefined();
    expect(usdc.issuer).toBeTruthy();
  });

  test('validateAsset returns true for XLM', () => {
    expect(validateAsset('XLM', null)).toBe(true);
  });

  test('validateAsset returns true for USDC with correct issuer', () => {
    const usdc = SUPPORTED_ASSETS.find((a) => a.code === 'USDC');
    expect(validateAsset('USDC', usdc.issuer)).toBe(true);
  });

  test('validateAsset returns false for wrong issuer', () => {
    expect(validateAsset('USDC', 'GWRONGISSUER')).toBe(false);
  });

  test('validateAsset returns false for unknown code', () => {
    expect(validateAsset('FAKE', 'GFAKE')).toBe(false);
  });

  test('getXLMEquivalent returns same for XLM', () => {
    expect(getXLMEquivalent('10', 'XLM')).toBe(10);
  });

  test('getXLMEquivalent converts USDC to XLM (rate > 1)', () => {
    expect(getXLMEquivalent('10', 'USDC')).toBeGreaterThan(10);
  });

  test('getXLMEquivalent returns 0 for negative amount', () => {
    expect(getXLMEquivalent('-5', 'XLM')).toBe(0);
  });

  test('getXLMEquivalent returns 0 for non-numeric input', () => {
    expect(getXLMEquivalent('abc', 'USDC')).toBe(0);
  });

  test('findAsset finds XLM', () => {
    expect(findAsset('XLM')).not.toBeNull();
  });

  test('findAsset returns null for unknown code', () => {
    expect(findAsset('UNKNOWN')).toBeNull();
  });
});
