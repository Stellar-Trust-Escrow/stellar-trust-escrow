import express from 'express';
import { getSupportedAssets, validateAsset, getXLMEquivalent, findAsset } from '../../services/assetService.js';

const router = express.Router();

router.get('/supported', (_req, res) => {
  res.json(getSupportedAssets());
});

router.post('/validate', (req, res) => {
  const { assetCode, issuer = null } = req.body ?? {};
  if (!assetCode) return res.status(400).json({ error: 'assetCode is required' });
  const valid = validateAsset(assetCode, issuer);
  res.json({ valid, asset: valid ? findAsset(assetCode, issuer) : null });
});

router.get('/xlm-equivalent', (req, res) => {
  const { amount, assetCode } = req.query;
  if (!amount || !assetCode) return res.status(400).json({ error: 'amount and assetCode are required' });
  const parsed = parseFloat(amount);
  if (!isFinite(parsed) || parsed < 0) return res.status(400).json({ error: 'amount must be a non-negative number' });
  res.json({ xlmAmount: getXLMEquivalent(parsed, assetCode), assetCode, amount: parsed });
});

export default router;
