import type { Keypair } from '@stellar/stellar-sdk';

export interface SdkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  signer: SecretKeySigner | FreighterSigner;
}

export interface SecretKeySigner {
  type: 'secret';
  keypair: Keypair;
}

export interface FreighterSigner {
  type: 'freighter';
}

export interface TxResult<T> {
  txHash: string;
  result: T;
  ledger: number;
}

export interface EscrowState {
  escrowId: bigint;
  client: string;
  freelancer: string;
  token: string;
  totalAmount: bigint;
  approvedCount: number;
  milestoneCount: number;
  status: number;
}

export interface Milestone {
  escrowId: bigint;
  milestoneId: number;
  description: string;
  amount: bigint;
  status: number;
}
