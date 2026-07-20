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

import {
  SorobanRpc,
  TransactionBuilder,
  Contract,
  BASE_FEE,
  xdr,
  nativeToScVal,
  Address,
  StrKey,
  scValToNative,
  Account,
  Keypair,
  hash,
} from '@stellar/stellar-sdk';
import { signMessage } from '@stellar/freighter-api';

const _NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet';
const _CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '';
const _SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const _SIGNED_MESSAGE_PREFIX = 'Stellar Signed Message:\n';

const _NETWORK_PASSPHRASE =
  _NETWORK === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';

/**
 * Fetches an address's on-chain reputation record by simulating the
 * `get_reputation` contract call.
 *
 * A disposable source account keeps simulation independent from whether the
 * profile address is funded. This read-only transaction is never submitted.
 *
 * @param {string} address - Stellar public key
 * @returns {Promise<{
 *   address: string,
 *   totalScore: number,
 *   completedEscrows: number,
 *   disputedEscrows: number,
 *   disputesWon: number,
 *   totalVolume: string,
 *   slashCount: number,
 *   totalSlashed: string,
 *   lastUpdated: number
 * }>}
 */
export async function getReputation(address) {
  if (!_CONTRACT_ADDRESS) {
    throw new Error('Contract address not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS.');
  }

  if (!isValidStellarAddress(address)) {
    throw new Error(`Invalid Stellar address: ${address}`);
  }

  const server = new SorobanRpc.Server(_SOROBAN_RPC_URL);
  const account = new Account(Keypair.random().publicKey(), '0');
  const contract = new Contract(_CONTRACT_ADDRESS);

  const transaction = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: _NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call('get_reputation', new Address(address).toScVal()))
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(transaction);
  if (SorobanRpc.isSimulationError(simulation)) {
    throw new Error(`Reputation fetch failed: ${simulation.error}`);
  }

  if (!simulation.result?.retval) {
    throw new Error('Reputation fetch failed: contract returned no value');
  }

  const record = scValToNative(simulation.result.retval);

  return {
    address: record.address?.toString?.() || address,
    totalScore: Number(record.total_score ?? 0),
    completedEscrows: Number(record.completed_escrows ?? 0),
    disputedEscrows: Number(record.disputed_escrows ?? 0),
    disputesWon: Number(record.disputes_won ?? 0),
    totalVolume: String(record.total_volume ?? 0),
    slashCount: Number(record.slash_count ?? 0),
    totalSlashed: String(record.total_slashed ?? 0),
    lastUpdated: Number(record.last_updated ?? 0),
  };
}

/**
 * Calculates the issue-defined trust score.
 *
 * `disputes_won` is not updated by `_update_reputation_internal` in the
 * escrow contract yet, so on-chain records currently treat every dispute as lost.
 *
 * @param {number} completedEscrows
 * @param {number} disputedEscrows
 * @param {number} disputesWon
 * @returns {number}
 */
export function calculateTrustScore(completedEscrows, disputedEscrows, disputesWon) {
  const completed = Math.max(0, Number(completedEscrows) || 0);
  const disputed = Math.max(0, Number(disputedEscrows) || 0);
  const won = Math.max(0, Number(disputesWon) || 0);
  const disputedLost = Math.max(0, disputed - won);

  return completed - disputedLost * 2;
}

/**
 * Calculates the percentage of disputes won.
 *
 * `disputes_won` is not updated by `_update_reputation_internal` in the
 * escrow contract yet, so this currently evaluates to 0% for on-chain records.
 *
 * @param {number} disputedEscrows
 * @param {number} disputesWon
 * @returns {number}
 */
export function calculateWinRate(disputedEscrows, disputesWon) {
  const disputed = Math.max(0, Number(disputedEscrows) || 0);
  const won = Math.max(0, Number(disputesWon) || 0);

  if (disputed === 0) return 0;
  return (Math.min(won, disputed) / disputed) * 100;
}

/**
 * Generates deterministic SVG-ready identicon data from a Stellar address.
 * The resulting 5x5 grid is mirrored vertically for a recognizable pattern.
 *
 * @param {string} address
 * @returns {{ color: string, background: string, cells: Array<{ x: number, y: number }> }}
 */
export function generateIdenticon(address) {
  const normalizedAddress = String(address || '');
  const seed = _hashString(normalizedAddress);
  const hue = seed % 360;
  const cells = [];

  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      const cellHash = _hashString(`${normalizedAddress}:${x}:${y}`);
      if ((cellHash & 1) === 0) continue;

      cells.push({ x, y });
      if (x !== 2) cells.push({ x: 4 - x, y });
    }
  }

  return {
    color: `hsl(${hue} 70% 55%)`,
    background: `hsl(${hue} 35% 12%)`,
    cells,
  };
}

/**
 * Stable FNV-1a hash for deterministic visual generation.
 *
 * @param {string} value
 * @returns {number}
 */
function _hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Builds and signs the profile ownership message with Freighter.
 *
 * @param {string} address - Connected wallet public key
 * @param {number} [timestamp=Date.now()]
 * @returns {Promise<{ message: string, signature: string, publicKey: string, timestamp: number }>}
 */
export async function signIdentityMessage(address, timestamp = Date.now()) {
  if (!isValidStellarAddress(address)) {
    throw new Error(`Invalid Stellar address: ${address}`);
  }

  const message = `Trustchain identity: ${address} at ${timestamp}`;
  const result = await signMessage(message, { address, accountToSign: address });
  const signature = result?.signedMessage ?? result?.signature ?? result;
  const publicKey = result?.signerAddress ?? result?.publicKey ?? address;

  if (typeof signature !== 'string' || !signature) {
    throw new Error('Freighter returned an invalid identity signature');
  }

  return { message, signature, publicKey, timestamp };
}

/**
 * Verifies an identity message signature locally with the Stellar SDK.
 *
 * @param {string} message
 * @param {string} signature - Base64-encoded Ed25519 signature
 * @param {string} publicKey - Stellar public key
 * @returns {boolean}
 */
export function verifyIdentitySignature(message, signature, publicKey) {
  try {
    const messageBytes = new TextEncoder().encode(`${_SIGNED_MESSAGE_PREFIX}${message}`);
    const messageHash = hash(messageBytes);
    const signatureBytes = _decodeBase64(signature);
    return Keypair.fromPublicKey(publicKey).verify(messageHash, signatureBytes);
  } catch {
    return false;
  }
}

function _decodeBase64(value) {
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(value, 'base64'));
  }

  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

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
  sourceAddress,
  freelancerAddress,
  tokenAddress,
  amount,
  briefHash,
  arbiter = null,
  deadline = null,
}) {
  if (!_CONTRACT_ADDRESS) {
    throw new Error('Contract address not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS.');
  }

  _validateInputs({
    sourceAddress,
    freelancerAddress,
    tokenAddress,
    amount,
    briefHash,
  });

  const server = new SorobanRpc.Server(_SOROBAN_RPC_URL);
  const account = await server.getAccount(sourceAddress);

  const contract = new Contract(_CONTRACT_ADDRESS);

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: _NETWORK_PASSPHRASE,
  });

  txBuilder.addOperation(
    contract.call(
      'create_escrow',
      new Address(sourceAddress).toScVal(),
      new Address(freelancerAddress).toScVal(),
      new Address(tokenAddress).toScVal(),
      nativeToScVal(BigInt(amount), { type: 'i128' }),
      xdr.ScVal.scvTypeBytes(Buffer.from(briefHash, 'hex')),
      arbiter ? xdr.ScVal.scvTypeOption(new Address(arbiter).toScVal()) : xdr.ScVal.scvTypeOption(),
      deadline ? nativeToScVal(BigInt(deadline), { type: 'u64' }) : xdr.ScVal.scvTypeOption(),
    ),
  );

  txBuilder.setTimeout(300);
  const tx = txBuilder.build();

  const prepared = await server.simulateTransaction(tx);
  if (SorobanRpc.isSimulationError(prepared)) {
    throw new Error(`Simulation failed: ${prepared.error}`);
  }

  const assembled = SorobanRpc.assembleTransaction(tx, prepared).build();
  return assembled.toXDR('base64');
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
  sourceAddress,
  escrowId,
  title,
  descriptionHash,
  amount,
}) {
  _validateInputs({ sourceAddress, escrowId, title, descriptionHash, amount });

  const server = new SorobanRpc.Server(_SOROBAN_RPC_URL);
  const account = await server.getAccount(sourceAddress);

  const contract = new Contract(_CONTRACT_ADDRESS);

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: _NETWORK_PASSPHRASE,
  });

  txBuilder.addOperation(
    contract.call(
      'add_milestone',
      new Address(sourceAddress).toScVal(),
      nativeToScVal(BigInt(escrowId), { type: 'u64' }),
      xdr.ScVal.scvTypeString(title),
      xdr.ScVal.scvTypeBytes(Buffer.from(descriptionHash, 'hex')),
      nativeToScVal(BigInt(amount), { type: 'i128' }),
    ),
  );

  txBuilder.setTimeout(300);
  const tx = txBuilder.build();

  const prepared = await server.simulateTransaction(tx);
  if (SorobanRpc.isSimulationError(prepared)) {
    throw new Error(`Simulation failed: ${prepared.error}`);
  }

  const assembled = SorobanRpc.assembleTransaction(tx, prepared).build();
  return assembled.toXDR('base64');
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
  sourceAddress,
  escrowId,
  milestoneId,
}) {
  _validateInputs({ sourceAddress, escrowId, milestoneId });

  const server = new SorobanRpc.Server(_SOROBAN_RPC_URL);
  const account = await server.getAccount(sourceAddress);

  const contract = new Contract(_CONTRACT_ADDRESS);

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: _NETWORK_PASSPHRASE,
  });

  txBuilder.addOperation(
    contract.call(
      'approve_milestone',
      new Address(sourceAddress).toScVal(),
      nativeToScVal(BigInt(escrowId), { type: 'u64' }),
      nativeToScVal(BigInt(milestoneId), { type: 'u32' }),
    ),
  );

  txBuilder.setTimeout(300);
  const tx = txBuilder.build();

  const prepared = await server.simulateTransaction(tx);
  if (SorobanRpc.isSimulationError(prepared)) {
    throw new Error(`Simulation failed: ${prepared.error}`);
  }

  const assembled = SorobanRpc.assembleTransaction(tx, prepared).build();
  return assembled.toXDR('base64');
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
  sourceAddress,
  escrowId,
  milestoneId,
}) {
  _validateInputs({ sourceAddress, escrowId, milestoneId });

  const server = new SorobanRpc.Server(_SOROBAN_RPC_URL);
  const account = await server.getAccount(sourceAddress);

  const contract = new Contract(_CONTRACT_ADDRESS);

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: _NETWORK_PASSPHRASE,
  });

  txBuilder.addOperation(
    contract.call(
      'submit_milestone',
      new Address(sourceAddress).toScVal(),
      nativeToScVal(BigInt(escrowId), { type: 'u64' }),
      nativeToScVal(BigInt(milestoneId), { type: 'u32' }),
    ),
  );

  txBuilder.setTimeout(300);
  const tx = txBuilder.build();

  const prepared = await server.simulateTransaction(tx);
  if (SorobanRpc.isSimulationError(prepared)) {
    throw new Error(`Simulation failed: ${prepared.error}`);
  }

  const assembled = SorobanRpc.assembleTransaction(tx, prepared).build();
  return assembled.toXDR('base64');
}

/**
 * Builds an unsigned `raise_dispute` transaction XDR.
 *
 * TODO (contributor — Issue #35)
 */
export async function buildRaiseDisputeTx({ sourceAddress, escrowId, milestoneId = null }) {
  _validateInputs({ sourceAddress, escrowId });

  const server = new SorobanRpc.Server(_SOROBAN_RPC_URL);
  const account = await server.getAccount(sourceAddress);

  const contract = new Contract(_CONTRACT_ADDRESS);

  const txBuilder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: _NETWORK_PASSPHRASE,
  });

  txBuilder.addOperation(
    contract.call(
      'raise_dispute',
      new Address(sourceAddress).toScVal(),
      nativeToScVal(BigInt(escrowId), { type: 'u64' }),
      milestoneId !== null
        ? xdr.ScVal.scvTypeOption(nativeToScVal(BigInt(milestoneId), { type: 'u32' }))
        : xdr.ScVal.scvTypeOption(),
    ),
  );

  txBuilder.setTimeout(300);
  const tx = txBuilder.build();

  const prepared = await server.simulateTransaction(tx);
  if (SorobanRpc.isSimulationError(prepared)) {
    throw new Error(`Simulation failed: ${prepared.error}`);
  }

  const assembled = SorobanRpc.assembleTransaction(tx, prepared).build();
  return assembled.toXDR('base64');
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
  return StrKey.isValidEd25519PublicKey(address);
}

/**
 * Helper to validate transaction builder inputs.
 * Throws descriptive errors for missing or invalid values.
 *
 * @param {object} params
 * @returns {void}
 * @throws {Error}
 */
function _validateInputs(params) {
  const { sourceAddress, freelancerAddress, tokenAddress, escrowId, amount, briefHash, title, descriptionHash, milestoneId } = params;

  if (sourceAddress && !isValidStellarAddress(sourceAddress)) {
    throw new Error(`Invalid source address: ${sourceAddress}`);
  }

  if (freelancerAddress && !isValidStellarAddress(freelancerAddress)) {
    throw new Error(`Invalid freelancer address: ${freelancerAddress}`);
  }

  if (tokenAddress && !isValidStellarAddress(tokenAddress)) {
    throw new Error(`Invalid token address: ${tokenAddress}`);
  }

  if (amount !== undefined && (Number(amount) <= 0 || !Number.isInteger(Number(amount)))) {
    throw new Error(`Amount must be a positive integer, got: ${amount}`);
  }

  if (briefHash !== undefined && !/^[a-f0-9]{64}$/i.test(briefHash)) {
    throw new Error(`Brief hash must be a 32-byte hex string, got: ${briefHash}`);
  }

  if (descriptionHash !== undefined && !/^[a-f0-9]{64}$/i.test(descriptionHash)) {
    throw new Error(`Description hash must be a 32-byte hex string, got: ${descriptionHash}`);
  }

  if (title !== undefined && !title) {
    throw new Error('Milestone title cannot be empty');
  }
}
