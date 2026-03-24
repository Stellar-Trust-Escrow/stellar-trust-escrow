/**
 * Stellar Service
 *
 * Thin wrapper around the Stellar SDK for server-side operations.
 * Used by the indexer and the broadcast endpoint.
 *
 * @module stellarService
 */

// TODO (contributor): uncomment when @stellar/stellar-sdk is installed
// const { SorobanRpc, Transaction, Networks } = require('@stellar/stellar-sdk');

const _RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK = process.env.STELLAR_NETWORK || 'testnet';
const NETWORK_PASSPHRASE =
  NETWORK === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';

/**
 * Submits a signed transaction XDR to the Stellar network.
 *
 * @param {string} signedXdr — base64-encoded signed Stellar transaction
 * @returns {Promise<{ hash: string, status: string, errorResultXdr?: string }>}
 *
 * TODO (contributor — hard, Issue #43):
 * 1. Deserialize XDR: new Transaction(signedXdr, NETWORK_PASSPHRASE)
 * 2. Initialize server: new SorobanRpc.Server(RPC_URL)
 * 3. Call server.sendTransaction(tx)
 * 4. Poll server.getTransaction(hash) until status !== 'NOT_FOUND'
 * 5. Return { hash, status: 'SUCCESS'|'FAILED', errorResultXdr? }
 */
const submitTransaction = async (_signedXdr) => {
  // TODO: implement
  throw new Error('submitTransaction not implemented — see Issue #43');
};

/**
 * Fetches contract events from Stellar since a given ledger.
 *
 * @param {number} startLedger — start scanning from this ledger sequence
 * @param {string} contractId  — the escrow contract address
 * @returns {Promise<Array>} array of raw Soroban event objects
 *
 * TODO (contributor — hard, Issue #27):
 * 1. server.getEvents({ startLedger, filters: [{ contractIds: [contractId] }] })
 * 2. Return events array
 */
const getContractEvents = async (_startLedger, _contractId) => {
  // TODO: implement
  throw new Error('getContractEvents not implemented — see Issue #27');
};

/**
 * Gets the current ledger sequence number.
 *
 * @returns {Promise<number>}
 *
 * TODO (contributor — easy, Issue #43):
 * const health = await server.getHealth();
 * return health.latestLedger;
 */
const getLatestLedger = async () => {
  // TODO: implement
  throw new Error('getLatestLedger not implemented — see Issue #43');
};

export { submitTransaction, getContractEvents, getLatestLedger, NETWORK_PASSPHRASE };
