import express from 'express';
import { estimateFee } from '../../services/feeEstimationService.js';

const router = express.Router();

router.post('/estimate-fee', async (req, res) => {
  try {
    const { amount, receiverAddress, milestones } = req.body;
    if (!amount) return res.status(400).json({ error: 'amount is required' });
    const result = await estimateFee({ amount, receiverAddress, milestones });
    res.json(result);
  } catch (err) {
    res.status(503).json({ error: 'Fee estimation unavailable', detail: err.message });
  }
});

export default router;
