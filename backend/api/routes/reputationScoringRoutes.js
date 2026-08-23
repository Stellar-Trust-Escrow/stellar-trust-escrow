import express from 'express';
import { calculateReputation, getTierList } from '../../services/reputationScoringService.js';

const router = express.Router();

router.post('/calculate', (req, res) => {
  const { walletAddress, stats } = req.body;
  if (!walletAddress) return res.status(400).json({ error: 'walletAddress is required' });
  if (!stats) return res.status(400).json({ error: 'stats object is required' });
  try { res.json(calculateReputation(walletAddress, stats)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/tiers', (_req, res) => {
  res.json({ tiers: getTierList() });
});

router.get('/:walletAddress', (req, res) => {
  const { walletAddress } = req.params;
  try { res.json(calculateReputation(walletAddress, {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
