// Lightweight TypeScript helpers for signing and broadcasting Soroban transactions
// Uses existing `frontend/lib/stellar.js` build helpers and Freighter in-browser signer.

import * as stellar from './stellar';

const NETWORK_PASSPHRASE =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet') === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';

export async function signWithFreighter(unsignedXdr: string): Promise<string> {
  if (typeof window === 'undefined') throw new Error('Freighter signing must run in browser');

  const anyWindow = window as any;
  const freighter = anyWindow.freighterApi || anyWindow.freighter;
  if (!freighter) throw new Error('Freighter not found. Install the Freighter browser extension.');

  // Try common Freighter API shapes. Return base64 signed XDR string.
  try {
    // Newer API: freighterApi.signTransaction(transactionXdr, networkPassphrase)
    if (typeof freighter.signTransaction === 'function') {
      const result = await freighter.signTransaction(unsignedXdr, NETWORK_PASSPHRASE);
      // Some implementations return { signedTransaction } or { signature, transaction }
      if (result.signedTransaction) return result.signedTransaction;
      if (result.transaction) return result.transaction;
      if (typeof result === 'string') return result;
    }

    // Older API shape: freighter.sign({ transactionXdr, networkPassphrase })
    if (typeof freighter.sign === 'function') {
      const r = await freighter.sign({ transactionXdr: unsignedXdr, networkPassphrase: NETWORK_PASSPHRASE });
      if (r.signedTransaction) return r.signedTransaction;
      if (r.transaction) return r.transaction;
      if (typeof r === 'string') return r;
    }

    throw new Error('Unsupported Freighter API shape.');
  } catch (err: any) {
    throw new Error(`Freighter signing failed: ${err?.message || String(err)}`);
  }
}

export async function buildSignAndBroadcastCreateEscrow(params: any) {
  // Build unsigned XDR using existing helper
  const unsigned = await (stellar as any).buildCreateEscrowTx(params);
  const signed = await signWithFreighter(unsigned);
  // Broadcast via frontend helper which posts to backend
  return (stellar as any).broadcastTransaction(signed);
}

export async function signAndBroadcast(signedXdr: string) {
  return (stellar as any).broadcastTransaction(signedXdr);
}

export default {
  signWithFreighter,
  buildSignAndBroadcastCreateEscrow,
  signAndBroadcast,
};
