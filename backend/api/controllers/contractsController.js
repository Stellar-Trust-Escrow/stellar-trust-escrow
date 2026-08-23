import { logControllerError } from '../../config/logger.js';

/**
 * GET /api/v1/contracts/addresses
 *
 * Returns the set of known on-chain contract addresses this platform
 * deploys, so clients (e.g. the wallet transaction history panel) can
 * label raw Horizon operations by which contract they touched, without
 * hardcoding addresses client-side.
 */
const getAddresses = async (req, res) => {
  try {
    const addresses = [
      { name: 'escrow', address: process.env.ESCROW_CONTRACT_ID || process.env.CONTRACT_ADDRESS || null },
      { name: 'referral_registry', address: process.env.REFERRAL_REGISTRY_CONTRACT_ID || null },
      { name: 'governance', address: process.env.GOVERNANCE_CONTRACT_ID || null },
      { name: 'insurance', address: process.env.INSURANCE_CONTRACT_ID || null },
    ].filter((c) => Boolean(c.address));

    return res.json({ contracts: addresses });
  } catch (err) {
    logControllerError('contractsController.getAddresses', err, req);
    return res.status(500).json({ error: 'Failed to load contract addresses.' });
  }
};

/**
 * GET /api/v1/contracts/status
 *
 * Soroban RPC connectivity check, used by the blue-green deploy smoke
 * tests and available generally as a health signal.
 */
const getStatus = async (req, res) => {
  const rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await response.json();
    const connected = response.ok && data?.result?.status === 'healthy';
    return res.status(connected ? 200 : 503).json({ connected });
  } catch (err) {
    logControllerError('contractsController.getStatus', err, req);
    return res.status(503).json({ connected: false });
  }
};

export default { getAddresses, getStatus };
