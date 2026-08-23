/**
 * Asset Service — registry of supported Stellar assets for multi-asset escrow.
 * @module services/assetService
 */
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('service.asset');

export const SUPPORTED_ASSETS = [
  { code: 'XLM', issuer: null, name: 'Stellar Lumens', decimals: 7, native: true },
  { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', name: 'USD Coin', decimals: 7, native: false },
  { code: 'EURC', issuer: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP', name: 'Euro Coin', decimals: 7, native: false },
  { code: 'yXLM', issuer: 'GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55', name: 'Yieldblox XLM', decimals: 7, native: false },
];

const XLM_RATES = { XLM: 1, USDC: 8.5, EURC: 9.2, yXLM: 1.02 };

export function getSupportedAssets() {
  log.info({ message: 'get_supported_assets', count: SUPPORTED_ASSETS.length });
  return SUPPORTED_ASSETS;
}

export function validateAsset(assetCode, issuer) {
  if (assetCode === 'XLM') return true;
  return SUPPORTED_ASSETS.some((a) => a.code === assetCode && a.issuer === issuer);
}

export function getXLMEquivalent(amount, assetCode) {
  const rate = XLM_RATES[assetCode] ?? 1;
  const parsed = parseFloat(String(amount));
  if (!isFinite(parsed) || parsed < 0) return 0;
  return parseFloat((parsed * rate).toFixed(7));
}

export function findAsset(code, issuer = null) {
  return SUPPORTED_ASSETS.find((a) => a.code === code && (a.native || a.issuer === issuer)) ?? null;
}
