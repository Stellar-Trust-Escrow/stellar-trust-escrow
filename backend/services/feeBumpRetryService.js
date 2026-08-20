'use strict';

/**
 * Fee-Bump Transaction Retry Service
 *
 * Monitors Stellar transactions that become stuck due to insufficient fees
 * and automatically submits fee-bump transactions with escalating fees until
 * the transaction is confirmed or the maximum attempt count is reached.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 4000; // 4 seconds between Horizon polls
const STUCK_THRESHOLD_MS = 30_000; // 30 s before a tx is considered stuck
const BASE_FEE_ESCALATION_FACTOR = 1.5;
const MAX_FEE_STROOPS = 10_000;
const MIN_BASE_FEE = 100; // Stellar minimum base fee in stroops

// ---------------------------------------------------------------------------
// Stubbed Stellar SDK primitives
// (Replace with real @stellar/stellar-sdk imports in production)
// ---------------------------------------------------------------------------
const StellarSDK = {
  Server: class {
    constructor(horizonUrl) {
      this.horizonUrl = horizonUrl;
    }
    async loadTransaction(txHash) {
      // Returns a transaction record from Horizon; stubbed here
      return { hash: txHash, status: 'pending', created_at: new Date().toISOString() };
    }
    async submitTransaction(tx) {
      // Submits a transaction envelope; returns result record
      return { hash: tx.hash || 'submitted_hash', successful: true };
    }
  },
  TransactionBuilder: {
    buildFeeBumpTransaction(innerTx, baseFee, opts) {
      return {
        hash: `fee_bump_${Date.now()}`,
        innerTx,
        baseFee,
        network: opts.networkPassphrase,
        sign(keypair) {
          this.signedBy = keypair.publicKey();
          return this;
        },
        toEnvelope() {
          return this;
        },
      };
    },
  },
  Networks: {
    PUBLIC: 'Public Global Stellar Network ; September 2015',
    TESTNET: 'Test SDF Network ; September 2015',
  },
};

// ---------------------------------------------------------------------------
// Stubbed Prisma DB client
// ---------------------------------------------------------------------------
const prisma = {
  feeRetryAudit: {
    create: async (data) => ({ id: Math.random(), ...data.data }),
  },
};

// ---------------------------------------------------------------------------
// Horizon server instance
// ---------------------------------------------------------------------------
const HORIZON_URL =
  process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE =
  process.env.STELLAR_NETWORK || StellarSDK.Networks.TESTNET;

const server = new StellarSDK.Server(HORIZON_URL);

// ---------------------------------------------------------------------------
// Signer pool — round-robin selection
// ---------------------------------------------------------------------------
const signerPool = process.env.FEE_BUMP_SIGNERS
  ? process.env.FEE_BUMP_SIGNERS.split(',').map((s) => s.trim())
  : ['SXXXXXXXX_DEFAULT_SIGNER_KEYPAIR_PLACEHOLDER'];

let signerPoolIndex = 0;

/**
 * Returns the next available signer keypair from the pool using round-robin.
 * In production each entry would be a real Keypair from the Stellar SDK.
 *
 * @returns {{ publicKey: () => string, secret: () => string }}
 */
function getSignerFromPool() {
  const secret = signerPool[signerPoolIndex % signerPool.length];
  signerPoolIndex++;
  // Stub keypair — replace with Keypair.fromSecret(secret) in production
  return {
    secret: () => secret,
    publicKey: () => `GPUBLIC_${secret.slice(0, 8)}`,
  };
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Detect whether a transaction has been pending longer than the stuck threshold.
 *
 * @param {string} txHash
 * @returns {Promise<boolean>}
 */
async function detectStuckTransaction(txHash) {
  try {
    const record = await server.loadTransaction(txHash);
    if (record.status === 'success' || record.status === 'failed') {
      return false;
    }
    const ageMs = Date.now() - new Date(record.created_at).getTime();
    return ageMs > STUCK_THRESHOLD_MS;
  } catch (err) {
    // Transaction not found on Horizon means it was never included; treat as stuck
    if (err.response && err.response.status === 404) return true;
    console.error('[FeeBumpRetry] Error loading transaction:', err.message);
    return false;
  }
}

/**
 * Apply fee escalation strategy: multiply by 1.5 per attempt, capped at MAX_FEE_STROOPS.
 *
 * @param {number} currentFee  Current fee in stroops
 * @param {number} attempt     Zero-based attempt index
 * @returns {number}           New fee in stroops (integer)
 */
function escalateFee(currentFee, attempt) {
  const escalated = Math.round(currentFee * Math.pow(BASE_FEE_ESCALATION_FACTOR, attempt));
  return Math.min(escalated, MAX_FEE_STROOPS);
}

/**
 * Construct a fee-bump transaction wrapping the original transaction.
 *
 * @param {object} originalTx        Parsed inner transaction object
 * @param {number} newFee            New base fee in stroops
 * @param {object} signerKeyPair     Keypair used to sign the bump tx
 * @returns {object}                 Signed fee-bump transaction envelope
 */
function buildFeeBumpTx(originalTx, newFee, signerKeyPair) {
  const feeBumpTx = StellarSDK.TransactionBuilder.buildFeeBumpTransaction(
    originalTx,
    newFee,
    { networkPassphrase: NETWORK_PASSPHRASE }
  );
  feeBumpTx.sign(signerKeyPair);
  return feeBumpTx.toEnvelope();
}

/**
 * Write a fee-bump retry attempt to the audit trail database.
 *
 * @param {string} txHash
 * @param {number} attempt
 * @param {number} newFee
 * @param {string} status   'submitted' | 'confirmed' | 'failed' | 'skipped'
 * @returns {Promise<object>}
 */
async function logRetryAttempt(txHash, attempt, newFee, status) {
  try {
    return await prisma.feeRetryAudit.create({
      data: {
        txHash,
        attempt,
        newFeeStroops: newFee,
        status,
        timestamp: new Date(),
      },
    });
  } catch (err) {
    console.error('[FeeBumpRetry] Failed to log retry attempt:', err.message);
    return null;
  }
}

/**
 * Poll Horizon until the transaction is confirmed, failed, or the timeout fires.
 *
 * @param {string} txHash
 * @param {object} signerKeyPair
 * @returns {Promise<{ status: string, hash: string }>}
 */
async function monitorTransaction(txHash, signerKeyPair) {
  const deadline = Date.now() + STUCK_THRESHOLD_MS * MAX_ATTEMPTS;

  while (Date.now() < deadline) {
    try {
      const record = await server.loadTransaction(txHash);
      if (record.status === 'success') return { status: 'confirmed', hash: txHash };
      if (record.status === 'failed') return { status: 'failed', hash: txHash };
    } catch (err) {
      console.warn('[FeeBumpRetry] Poll error:', err.message);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  // Timed out — hand off to escalation
  return retryWithEscalation(txHash, signerKeyPair);
}

/**
 * Orchestrate the full fee-bump retry loop.
 *
 * Attempts up to MAX_ATTEMPTS fee-bump submissions with escalating fees,
 * stopping early if the transaction confirms or permanently fails.
 *
 * @param {string} txHash
 * @param {object} [signerKeyPair]   Optional override; defaults to pool signer
 * @returns {Promise<{ success: boolean, finalStatus: string, attempts: number }>}
 */
async function retryWithEscalation(txHash, signerKeyPair) {
  let currentFee = MIN_BASE_FEE;
  let finalStatus = 'unknown';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const isStuck = await detectStuckTransaction(txHash);
    if (!isStuck) {
      finalStatus = 'confirmed_before_bump';
      await logRetryAttempt(txHash, attempt, currentFee, 'skipped');
      return { success: true, finalStatus, attempts: attempt };
    }

    const signer = signerKeyPair || getSignerFromPool();
    const newFee = escalateFee(currentFee, attempt);

    let submitResult = null;
    try {
      // In production: load and parse the original tx via Horizon
      const originalTx = { hash: txHash, _stub: true };
      const bumpEnvelope = buildFeeBumpTx(originalTx, newFee, signer);
      submitResult = await server.submitTransaction(bumpEnvelope);
      finalStatus = submitResult.successful ? 'confirmed' : 'failed';
    } catch (err) {
      console.error(`[FeeBumpRetry] Submit error attempt ${attempt}:`, err.message);
      finalStatus = 'submit_error';
    }

    await logRetryAttempt(txHash, attempt, newFee, finalStatus);

    if (finalStatus === 'confirmed') {
      return { success: true, finalStatus, attempts: attempt + 1 };
    }
    if (finalStatus === 'failed') {
      return { success: false, finalStatus, attempts: attempt + 1 };
    }

    currentFee = newFee;
    // Short pause between attempts to avoid hammering Horizon
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return { success: false, finalStatus: 'max_attempts_reached', attempts: MAX_ATTEMPTS };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  monitorTransaction,
  detectStuckTransaction,
  buildFeeBumpTx,
  escalateFee,
  getSignerFromPool,
  logRetryAttempt,
  retryWithEscalation,
  // Exposed for testing / configuration
  MAX_ATTEMPTS,
  MAX_FEE_STROOPS,
  STUCK_THRESHOLD_MS,
};
