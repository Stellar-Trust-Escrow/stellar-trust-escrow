/**
 * Stellar Service
 *
 * Thin wrapper around the Stellar SDK for server-side operations.
 * Used by the indexer and the broadcast endpoint.
 *
 * @module stellarService
 */

import { SorobanRpc, Transaction, Networks } from '@stellar/stellar-sdk';

const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK = process.env.STELLAR_NETWORK || 'testnet';

export const NETWORK_PASSPHRASE = NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

/** @returns {SorobanRpc.Server} */
const getServer = () =>
  new SorobanRpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith('http://') });

/**
 * Submits a signed transaction XDR to the Stellar network and polls until settled.
 *
 * @param {string} signedXdr — base64-encoded signed Stellar transaction
 * @returns {Promise<{ hash: string, status: string, errorResultXdr?: string }>}
 */
const submitTransaction = async (signedXdr) => {
  const server = getServer();
  const tx = new Transaction(signedXdr, NETWORK_PASSPHRASE);
  const sendResult = await server.sendTransaction(tx);

  if (sendResult.status === 'ERROR') {
    return { hash: sendResult.hash, status: 'FAILED', errorResultXdr: sendResult.errorResultXdr };
  }

  // Poll until the transaction is no longer pending
  const hash = sendResult.hash;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const result = await server.getTransaction(hash);
    if (result.status !== 'NOT_FOUND') {
      return {
        hash,
        status: result.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
        errorResultXdr: result.resultXdr,
      };
    }
  }

  return { hash, status: 'TIMEOUT' };
};

/**
 * Fetches contract events from Stellar since a given ledger.
 *
 * @param {number} startLedger — start scanning from this ledger sequence
 * @param {string} contractId  — the escrow contract address
 * @returns {Promise<Array>} array of raw Soroban event objects
 */
const getContractEvents = async (startLedger, contractId) => {
  const server = getServer();
  const response = await server.getEvents({
    startLedger,
    filters: [{ type: 'contract', contractIds: [contractId] }],
  });
  return response.events ?? [];
};

/**
 * Gets the current ledger sequence number.
 *
 * @returns {Promise<number>}
 */
const getLatestLedger = async () => {
  const server = getServer();
  const health = await server.getLatestLedger();
  return health.sequence;
};

export { submitTransaction, getContractEvents, getLatestLedger };
