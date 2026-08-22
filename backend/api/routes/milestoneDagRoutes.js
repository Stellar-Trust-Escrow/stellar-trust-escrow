import express from 'express';
import { validateMilestonePlan, getReadyMilestones, buildDag } from '../../services/milestoneDagService.js';

const router = express.Router();

router.post('/validate', (req, res) => {
  const { milestones } = req.body;
  if (!Array.isArray(milestones) || milestones.length === 0)
    return res.status(400).json({ error: 'milestones array is required' });
  try { res.json(validateMilestonePlan(milestones)); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/ready', (req, res) => {
  const { milestones, completedIds = [] } = req.body;
  if (!Array.isArray(milestones)) return res.status(400).json({ error: 'milestones array is required' });
  try {
    const nodes = buildDag(milestones);
    const ready = getReadyMilestones(nodes, new Set(completedIds));
    res.json({ ready, count: ready.length });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

export default router;
