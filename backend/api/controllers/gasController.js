/**
 * Gas Controller — Transaction Fee Estimation API
 *
 * Exposes POST /api/tx/estimate-fee
 *
 * Accepts smart contract invocation parameters, runs a dry-run simulation
 * against a Soroban/Horizon RPC node to determine exact CPU and memory
 * consumption, then returns low / standard / high fee suggestions calibrated
 * to current network congestion.
 *
 * Request body:
 *  {
 *    contractId:  string   — Soroban contract address (C…)
 *    method:      string   — Contract function name
 *    args:        any[]    — Positional arguments (JSON-serialisable)
 *    sourceAccount: string — Stellar public key of the transaction source (G…)
 *  }
 *
 * Response (200):
 *  {
 *    simulation: { cpuInstructions, memoryBytes, minFeeStroops }
 *    congestion: { recentMedianFee, percentile75Fee, percentile95Fee }
 *    suggestions: {
 *      low:      { feeStroops, feeXLM, estimatedWaitBlocks }
 *      standard: { feeStroops, feeXLM, estimatedWaitBlocks }
 *      high:     { feeStroops, feeXLM, estimatedWaitBlocks }
 *    }
 *    simulatedAt: ISO timestamp
 *  }
 *
 * @module api/controllers/gasController
 */

import { SorobanRpc, xdr, Networks, TransactionBuilder, Account, Operation, Contract } from '@stellar/stellar-sdk';
import { logControllerError } from '../../config/logger.js';

// ── Configuration ─────────────────────────────────────────────────────────────

const RPC_URL = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK = process.env.STELLAR_NETWORK || 'testnet';
const NETWORK_PASSPHRASE = NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

// Whitelist of allowed caller origins / API keys for internal request verification
const INTERNAL_API_KEYS = new Set(
  (process.env.GAS_ESTIMATOR_API_KEYS || '').split(',').map((k) => k.trim()).filter(Boolean),
);

// Stroops per XLM
const STROOPS_PER_XLM = 10_000_000;

// Base fee floor (100 stroops = Stellar minimum)
const BASE_FEE_STROOPS = 100;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert stroops to XLM string with 7 decimal places. */
function stroopsToXLM(stroops) {
  return (stroops / STROOPS_PER_XLM).toFixed(7);
}

/**
 * Validate the request body.
 * Returns an error string or null if valid.
 *
 * @param {object} body
 * @returns {string|null}
 */
function validateBody(body) {
  const { contractId, method, args, sourceAccount } = body ?? {};
  if (!contractId || typeof contractId !== 'string' || !contractId.startsWith('C')) {
    return 'contractId must be a valid Soroban contract address (starts with C)';
  }
  if (!method || typeof method !== 'string') {
    return 'method must be a non-empty string';
  }
  if (args !== undefined && !Array.isArray(args)) {
    return 'args must be an array';
  }
  if (!sourceAccount || typeof sourceAccount !== 'string' || !sourceAccount.startsWith('G')) {
    return 'sourceAccount must be a valid Stellar public key (starts with G)';
  }
  return null;
}

/**
 * Build a minimal Soroban transaction for simulation purposes.
 * Uses a dummy sequence number — simulation does not require a real sequence.
 *
 * @param {string} contractId
 * @param {string} method
 * @param {xdr.ScVal[]} scArgs
 * @param {string} sourceAccount
 * @returns {import('@stellar/stellar-sdk').Transaction}
 */
function buildSimulationTx(contractId, method, scArgs, sourceAccount) {
  const account = new Account(sourceAccount, '0');
  const contract = new Contract(contractId);
  return new TransactionBuilder(account, {
    fee: String(BASE_FEE_STROOPS),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...scArgs))
    .setTimeout(30)
    .build();
}

/**
 * Fetch recent fee statistics from the Soroban RPC node.
 * Falls back to sensible defaults if the endpoint is unavailable.
 *
 * @param {SorobanRpc.Server} server
 * @returns {Promise<{ recentMedianFee: number, percentile75Fee: number, percentile95Fee: number }>}
 */
async function fetchFeeStats(server) {
  try {
    const stats = await server.getFeeStats();
    const inclusionFees = stats?.sorobanInclusionFee;
    if (inclusionFees) {
      return {
        recentMedianFee: Number(inclusionFees.p50 ?? BASE_FEE_STROOPS),
        percentile75Fee: Number(inclusionFees.p75 ?? BASE_FEE_STROOPS * 2),
        percentile95Fee: Number(inclusionFees.p99 ?? BASE_FEE_STROOPS * 5),
      };
    }
  } catch { /* fall through to defaults */ }

  return {
    recentMedianFee: BASE_FEE_STROOPS,
    percentile75Fee: BASE_FEE_STROOPS * 2,
    percentile95Fee: BASE_FEE_STROOPS * 5,
  };
}

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * POST /api/tx/estimate-fee
 *
 * Internal request verification: if INTERNAL_API_KEYS is configured, the
 * request must include a matching `x-api-key` header.
 */
export const estimateFee = async (req, res) => {
  // Internal whitelist check
  if (INTERNAL_API_KEYS.size > 0) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || !INTERNAL_API_KEYS.has(apiKey)) {
      return res.status(403).json({ error: 'Forbidden: invalid or missing API key' });
    }
  }

  const validationError = validateBody(req.body);
  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  const { contractId, method, args = [], sourceAccount } = req.body;

  try {
    const server = new SorobanRpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith('http://') });

    // Convert JSON args to ScVal (pass-through if already encoded; otherwise wrap as strings)
    const scArgs = args.map((a) => {
      if (a && typeof a === 'object' && a._type) return xdr.ScVal.fromXDR(a._xdr, 'base64');
      // Wrap primitive values as ScString for simulation purposes
      return xdr.ScVal.scvString(String(a));
    });

    const tx = buildSimulationTx(contractId, method, scArgs, sourceAccount);

    // Run dry-run simulation
    const simResult = await server.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationError(simResult)) {
      return res.status(422).json({
        error: 'Simulation failed',
        detail: simResult.error,
      });
    }

    const { minResourceFee, cost } = simResult;
    const minFeeStroops = Number(minResourceFee ?? BASE_FEE_STROOPS);
    const cpuInstructions = Number(cost?.cpuInsns ?? 0);
    const memoryBytes = Number(cost?.memBytes ?? 0);

    // Fetch network congestion data in parallel with simulation (already done above)
    const congestion = await fetchFeeStats(server);

    // Build fee suggestions
    // low:      max(minFee, median)        — may wait longer
    // standard: max(minFee, p75)           — typical inclusion
    // high:     max(minFee, p95) * 1.2     — fast inclusion
    const lowFee = Math.max(minFeeStroops, congestion.recentMedianFee);
    const standardFee = Math.max(minFeeStroops, congestion.percentile75Fee);
    const highFee = Math.ceil(Math.max(minFeeStroops, congestion.percentile95Fee) * 1.2);

    return res.json({
      simulation: {
        cpuInstructions,
        memoryBytes,
        minFeeStroops,
      },
      congestion,
      suggestions: {
        low: {
          feeStroops: lowFee,
          feeXLM: stroopsToXLM(lowFee),
          estimatedWaitBlocks: 5,
        },
        standard: {
          feeStroops: standardFee,
          feeXLM: stroopsToXLM(standardFee),
          estimatedWaitBlocks: 2,
        },
        high: {
          feeStroops: highFee,
          feeXLM: stroopsToXLM(highFee),
          estimatedWaitBlocks: 1,
        },
      },
      simulatedAt: new Date().toISOString(),
    });
  } catch (err) {
    logControllerError('gas.estimateFee', err, req);
    return res.status(500).json({ error: 'Fee estimation failed', detail: err.message });
  }
};

export default { estimateFee };
