import { Router } from 'express';
import { validateDAG, topologicalSort, canSubmitMilestone } from '../../services/milestoneDAGService.js';

const router = Router();

// POST /api/v1/milestones/dag/validate
router.post('/validate', (req, res) => {
  const { milestones } = req.body;
  if (!Array.isArray(milestones)) {
    return res.status(400).json({ error: 'milestones must be an array' });
  }
  return res.json(validateDAG(milestones));
});

// POST /api/v1/milestones/dag/sort
router.post('/sort', (req, res) => {
  const { milestones } = req.body;
  if (!Array.isArray(milestones)) {
    return res.status(400).json({ error: 'milestones must be an array' });
  }
  return res.json(topologicalSort(milestones));
});

// POST /api/v1/milestones/dag/can-submit
router.post('/can-submit', (req, res) => {
  const { milestoneId, milestones, statusMap } = req.body;
  if (!milestoneId || !Array.isArray(milestones) || typeof statusMap !== 'object') {
    return res.status(400).json({ error: 'milestoneId, milestones, and statusMap are required' });
  }
  return res.json({ milestoneId, canSubmit: canSubmitMilestone(milestoneId, milestones, statusMap) });
});

export default router;
