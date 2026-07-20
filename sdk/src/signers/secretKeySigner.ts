import { Keypair, Transaction, FeeBumpTransaction } from '@stellar/stellar-sdk';
import type { SecretKeySigner } from '../types.js';

export function createSecretKeySigner(secretKey: string): SecretKeySigner {
  return { type: 'secret', keypair: Keypair.fromSecret(secretKey) };
}

export function signWithKeypair(
  tx: Transaction | FeeBumpTransaction,
  keypair: Keypair,
  _networkPassphrase: string,
): string {
  tx.sign(keypair);
  return tx.toXDR();
}
