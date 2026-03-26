/**
 * Relayer Routes
 *
 * API endpoints for meta-transaction relaying.
 */

import express from 'express';
import { createRelayer } from '../../services/relayerService.js';
import { errorsTotal } from '../../lib/metrics.js';

const router = express.Router();

// Initialize relayer service
const relayer = createRelayer({
  network:
    process.env.STELLAR_NETWORK === 'mainnet'
      ? 'Public Global Stellar Network ; September 2015'
      : 'Test SDF Network ; September 2015',
  contractId: process.env.ESCROW_CONTRACT_ID,
  relayerSecret: process.env.RELAYER_SECRET_KEY,
});

/**
 * POST /api/relayer/execute
 * Execute a meta-transaction
 */
router.post('/execute', async (req, res) => {
  try {
    const { metaTx, feeDelegation } = req.body;

    if (!metaTx) {
      return res.status(400).json({
        error: 'Meta-transaction data is required',
      });
    }

    const result = await relayer.executeMetaTransaction(metaTx, feeDelegation);

    if (result.success) {
      res.json({
        success: true,
        transactionHash: result.transactionHash,
        ledger: result.ledger,
        nonce: result.metaTxNonce,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        nonce: result.metaTxNonce,
      });
    }
  } catch (error) {
    console.error('Relayer execution error:', error);
    errorsTotal.inc({ type: 'relayer_error', route: '/api/relayer/execute' });

    res.status(500).json({
      error: 'Failed to execute meta-transaction',
      details: error.message,
    });
  }
});

/**
 * GET /api/relayer/fee-estimate
 * Estimate fee for a meta-transaction
 */
router.post('/fee-estimate', async (req, res) => {
  try {
    const { metaTx } = req.body;

    if (!metaTx) {
      return res.status(400).json({
        error: 'Meta-transaction data is required',
      });
    }

    const estimatedFee = await relayer.estimateFee(metaTx);

    res.json({
      estimatedFee,
      feeToken: 'XLM',
      unit: 'stroops',
    });
  } catch (error) {
    console.error('Fee estimation error:', error);
    errorsTotal.inc({ type: 'fee_estimation_error', route: '/api/relayer/fee-estimate' });

    res.status(500).json({
      error: 'Failed to estimate fee',
      details: error.message,
    });
  }
});

/**
 * GET /api/relayer/status
 * Get relayer service status
 */
router.get('/status', (req, res) => {
  res.json({
    status: 'active',
    network: process.env.STELLAR_NETWORK,
    contractId: process.env.ESCROW_CONTRACT_ID,
    relayerAddress: relayer.relayerKeypair.publicKey(),
  });
});

export default router;
