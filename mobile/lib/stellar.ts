/**
 * Stellar utilities for the mobile app.
 *
 * On mobile, transaction signing is handled differently from the web:
 * - No Freighter extension available
 * - Users sign via WalletConnect or a deep-link to a mobile wallet
 * - For now we support manual XDR signing flow (paste signed XDR)
 *   and WalletConnect v2 as the primary path.
 */

const NETWORK = process.env.EXPO_PUBLIC_STELLAR_NETWORK ?? 'testnet';

export const NETWORK_PASSPHRASE =
  NETWORK === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';

export const HORIZON_URL =
  NETWORK === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';

/**
 * Truncates a Stellar address for display.
 * e.g. GABCD…XYZ1
 */
export function truncateAddress(address: string, head = 6, tail = 4): string {
  if (!address || address.length < head + tail) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/**
 * Validates a Stellar public key format (G + 55 base32 chars).
 */
export function isValidStellarAddress(address: string): boolean {
  return typeof address === 'string' && /^G[A-Z2-7]{55}$/.test(address);
}

/**
 * Formats a stroops value (BigInt string) to a human-readable XLM amount.
 * 1 XLM = 10_000_000 stroops
 */
export function stroopsToXlm(stroops: string): string {
  const val = BigInt(stroops);
  const xlm = Number(val) / 10_000_000;
  return xlm.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 7 });
}

/**
 * Returns a Stellar explorer URL for an address or transaction.
 */
export function explorerUrl(type: 'account' | 'tx', value: string): string {
  const base =
    NETWORK === 'mainnet'
      ? 'https://stellar.expert/explorer/public'
      : 'https://stellar.expert/explorer/testnet';
  return type === 'account' ? `${base}/account/${value}` : `${base}/tx/${value}`;
}
