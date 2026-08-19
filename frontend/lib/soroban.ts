// Lightweight TypeScript helpers for signing and broadcasting Soroban transactions
// Uses existing `frontend/lib/stellar.js` build helpers and Freighter in-browser signer.

import * as stellar from './stellar';

const NETWORK_PASSPHRASE =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet') === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';

export async function signWithFreighter(unsignedXdr: string): Promise<string> {
  if (typeof window === 'undefined') throw new Error('Freighter signing must run in browser');

  const anyWindow = window as Window & { freighterApi?: { signTransaction: (xdr: string, opts: Record<string, string>) => Promise<string> }; freighter?: { signTransaction: (xdr: string, opts: Record<string, string>) => Promise<string> }; };
  const freighter = anyWindow.freighterApi || anyWindow.freighter;
  if (!freighter) throw new Error('Freighter not found. Install the Freighter browser extension.');

  // Try common Freighter API shapes. Return base64 signed XDR string.
  try {
    // Newer API: freighterApi.signTransaction(transactionXdr, networkPassphrase)
    if (typeof freighter.signTransaction === 'function') {
      const result = await freighter.signTransaction(unsignedXdr, { networkPassphrase: NETWORK_PASSPHRASE });
      // Some implementations return { signedTransaction } or { signature, transaction }
      if ((result as unknown as Record<string, unknown>)['signedTransaction']) return (result as unknown as Record<string, unknown>)['signedTransaction'] as string;
      if ((result as unknown as Record<string, unknown>)['transaction']) return (result as unknown as Record<string, unknown>)['transaction'] as string;
      if (typeof result === 'string') return result;
    }

    // Older API shape: freighter.sign({ transactionXdr, networkPassphrase })
    if (typeof (freighter as unknown as Record<string, unknown>)['sign'] === 'function') {
      const r = await (freighter as unknown as { sign: (opts: Record<string, string>) => Promise<Record<string, string>> }).sign({ transactionXdr: unsignedXdr, networkPassphrase: NETWORK_PASSPHRASE });
      if (r['signedTransaction']) return r['signedTransaction'];
      if (r['transaction']) return r['transaction'];
      if (typeof r === 'string') return r;
    }

    throw new Error('Unsupported Freighter API shape.');
  } catch (err: unknown) {
    throw new Error(`Freighter signing failed: ${(err as Error)?.message || String(err)}`);
  }
}

export async function buildSignAndBroadcastCreateEscrow(params: unknown) {
  // Build unsigned XDR using existing helper
  const unsigned = await (stellar as unknown as Record<string, (p: unknown) => Promise<string>>)['buildCreateEscrowTx'](params);
  const signed = await signWithFreighter(unsigned);
  // Broadcast via frontend helper which posts to backend
  return (stellar as unknown as Record<string, (p: unknown) => Promise<unknown>>)['broadcastTransaction'](signed);
}

export async function signAndBroadcast(signedXdr: string) {
  return (stellar as unknown as Record<string, (p: unknown) => Promise<unknown>>)['broadcastTransaction'](signedXdr);
}

export default {
  signWithFreighter,
  buildSignAndBroadcastCreateEscrow,
  signAndBroadcast,
};
