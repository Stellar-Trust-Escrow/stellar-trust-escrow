/**
 * Exports a pre-configured EscrowContractClient for use across the frontend.
 * Uses FreighterSigner so all transactions flow through the browser extension.
 */

import { EscrowContractClient, createFreighterSigner } from '@stellar-trust/sdk';
import type { SdkConfig } from '@stellar-trust/sdk';

const NETWORK_PASSPHRASE =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet') === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';

const sdkConfig: SdkConfig = {
  rpcUrl: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  networkPassphrase: NETWORK_PASSPHRASE,
  contractId: process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID || '',
  signer: createFreighterSigner(),
};

export const escrowClient = new EscrowContractClient(sdkConfig);

export {
  EscrowContractClient,
  createFreighterSigner,
  createSecretKeySigner,
} from '@stellar-trust/sdk';
export type { SdkConfig, TxResult, EscrowState, Milestone } from '@stellar-trust/sdk';
