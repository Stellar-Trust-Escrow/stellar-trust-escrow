/**
 * Stellar SDK Helpers
 *
 * Utility functions for building and submitting Soroban transactions.
 * Used by the frontend to interact with the escrow contract.
 *
 * All functions build unsigned transactions — signing is done by
 * the useWallet hook (Freighter) before broadcasting.
 *
 * @module stellar
 */

// TODO (contributor — hard, Issue #35): uncomment and implement
// import {
//   SorobanRpc,
//   TransactionBuilder,
//   Contract,
//   Networks,
//   BASE_FEE,
//   xdr,
// } from '@stellar/stellar-sdk';

const _NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';
const _CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '';
const _SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';

const _NETWORK_PASSPHRASE =
  _NETWORK === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';

/**
 * Builds an unsigned `create_escrow` Soroban transaction XDR.
 *
 * @param {object} params
 * @param {string} params.sourceAddress     — the client's Stellar public key
 * @param {string} params.freelancerAddress — the freelancer's Stellar public key
 * @param {string} params.tokenAddress      — Stellar Asset Contract address
 * @param {string} params.amount            — total amount in stroops (as string)
 * @param {string} params.briefHash         — 32-byte hex content hash
 * @param {string|null} params.arbiter      — optional arbiter address
 * @param {number|null} params.deadline     — optional Unix timestamp
 * @returns {Promise<string>} unsigned transaction XDR (base64)
 *
 * TODO (contributor — hard, Issue #35):
 * 1. Initialize SorobanRpc.Server with SOROBAN_RPC_URL
 * 2. Fetch source account: server.getAccount(sourceAddress)
 * 3. Build TransactionBuilder with CONTRACT_ADDRESS
 * 4. Add contract.call('create_escrow', ...args) operation
 * 5. Call server.prepareTransaction(tx) to simulate + get footprint
 * 6. Return tx.toXDR('base64')
 */
export async function buildCreateEscrowTx({
  sourceAddress: _sourceAddress,
  freelancerAddress: _freelancerAddress,
  tokenAddress: _tokenAddress,
  amount: _amount,
  briefHash: _briefHash,
  arbiter: _arbiter = null,
  deadline: _deadline = null,
}) {
  // TODO (contributor — Issue #35): implement
  throw new Error('buildCreateEscrowTx not implemented — see Issue #35');
}

/**
 * Builds an unsigned `add_milestone` transaction XDR.
 *
 * @param {object} params
 * @param {string} params.sourceAddress     — client address (caller)
 * @param {string} params.escrowId
 * @param {string} params.title
 * @param {string} params.descriptionHash
 * @param {string} params.amount            — milestone amount in stroops
 * @returns {Promise<string>} unsigned transaction XDR
 *
 * TODO (contributor — Issue #35)
 */
export async function buildAddMilestoneTx({
  sourceAddress: _sourceAddress,
  escrowId: _escrowId,
  title: _title,
  descriptionHash: _descriptionHash,
  amount: _amount,
}) {
  throw new Error('buildAddMilestoneTx not implemented — see Issue #35');
}

/**
 * Builds an unsigned `approve_milestone` transaction XDR.
 *
 * @param {object} params
 * @param {string} params.sourceAddress  — client address
 * @param {string} params.escrowId
 * @param {number} params.milestoneId
 * @returns {Promise<string>} unsigned transaction XDR
 *
 * TODO (contributor — Issue #35)
 */
export async function buildApproveMilestoneTx({
  sourceAddress: _sourceAddress,
  escrowId: _escrowId,
  milestoneId: _milestoneId,
}) {
  throw new Error('buildApproveMilestoneTx not implemented — see Issue #35');
}

/**
 * Builds an unsigned `submit_milestone` transaction XDR.
 *
 * @param {object} params
 * @param {string} params.sourceAddress  — freelancer address
 * @param {string} params.escrowId
 * @param {number} params.milestoneId
 * @returns {Promise<string>} unsigned transaction XDR
 *
 * TODO (contributor — Issue #35)
 */
export async function buildSubmitMilestoneTx({
  sourceAddress: _sourceAddress,
  escrowId: _escrowId,
  milestoneId: _milestoneId,
}) {
  throw new Error('buildSubmitMilestoneTx not implemented — see Issue #35');
}

/**
 * Builds an unsigned `raise_dispute` transaction XDR.
 *
 * TODO (contributor — Issue #35)
 */
export async function buildRaiseDisputeTx({ sourceAddress: _sourceAddress, escrowId: _escrowId }) {
  throw new Error('buildRaiseDisputeTx not implemented — see Issue #35');
}

/**
 * Broadcasts a signed transaction XDR to the Stellar network.
 *
 * @param {string} signedXdr — base64-encoded signed XDR
 * @returns {Promise<{ hash: string, status: string }>}
 *
 * TODO (contributor — Issue #35):
 * 1. POST signedXdr to backend: POST /api/escrows/broadcast
 * 2. Backend submits to Stellar
 * 3. Return { hash, status }
 */
export async function broadcastTransaction(signedXdr) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/escrows/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedXdr }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Broadcast failed');
  }
  return res.json();
}

/**
 * Truncates a Stellar public key for display.
 * e.g. "GABCD...XYZ1"
 *
 * @param {string} address
 * @param {number} [head=6]
 * @param {number} [tail=4]
 * @returns {string}
 */
export function truncateAddress(address, head = 6, tail = 4) {
  if (!address || address.length < head + tail) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/**
 * Validates that a string is a valid Stellar public key format.
 *
 * @param {string} address
 * @returns {boolean}
 *
 * TODO (contributor — easy, Issue #39): use StrKey.isValidEd25519PublicKey from stellar-sdk
 */
export function isValidStellarAddress(address) {
  // TODO: use stellar-sdk StrKey validation
  return typeof address === 'string' && address.startsWith('G') && address.length === 56;
}
