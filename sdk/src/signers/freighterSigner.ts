import type { FreighterSigner } from '../types.js';
import { UserRejectedError } from '../errors.js';

export function createFreighterSigner(): FreighterSigner {
  return { type: 'freighter' };
}

export async function signWithFreighter(xdr: string, networkPassphrase: string): Promise<string> {
  const freighter = (
    globalThis as unknown as {
      freighterApi?: {
        signTransaction: (xdr: string, opts: { networkPassphrase: string }) => Promise<string>;
      };
    }
  ).freighterApi;
  if (!freighter) {
    throw new Error('Freighter extension is not installed');
  }
  try {
    return await freighter.signTransaction(xdr, { networkPassphrase });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('cancel')) {
      throw new UserRejectedError();
    }
    throw err;
  }
}
