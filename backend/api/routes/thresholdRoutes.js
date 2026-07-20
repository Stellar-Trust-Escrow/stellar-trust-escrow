import express from 'express';
import { SorobanRpc } from '@stellar/stellar-sdk';
import prisma from '../../lib/prisma.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router({ mergeParams: true });
router.use(authMiddleware);

function parseMilestoneId(value) {
  const milestoneId = Number(value);
  return Number.isInteger(milestoneId) && milestoneId >= 0 ? milestoneId : null;
}

router.get('/', async (req, res) => {
  try {
    const escrowId = req.params.id;
    const [config, milestones] = await Promise.all([
      prisma.escrowApprovers.findUnique({ where: { escrowId } }),
      prisma.milestone.findMany({
        where: { escrowId, status: 'Submitted' },
        orderBy: { milestoneIndex: 'asc' },
      }),
    ]);

    const pendingMilestones = await Promise.all(
      milestones.map(async (milestone) => {
        const votes = await prisma.milestoneApprovalRecord.findMany({
          where: { escrowId, milestoneId: milestone.id },
          orderBy: { approvedAt: 'asc' },
        });
        return { ...milestone, votes };
      }),
    );

    return res.json({
      approvers: config?.approvers ?? [],
      threshold: config?.threshold ?? 1,
      pendingMilestones,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:milestoneId', async (req, res) => {
  const milestoneId = parseMilestoneId(req.params.milestoneId);
  if (milestoneId === null) {
    return res.status(400).json({ error: 'milestoneId must be a non-negative integer' });
  }

  try {
    const escrowId = req.params.id;
    const [config, votes] = await Promise.all([
      prisma.escrowApprovers.findUnique({ where: { escrowId } }),
      prisma.milestoneApprovalRecord.findMany({
        where: { escrowId, milestoneId },
        orderBy: { approvedAt: 'asc' },
      }),
    ]);
    const threshold = config?.threshold ?? 1;

    return res.json({
      milestoneId,
      threshold,
      votesCount: votes.length,
      thresholdMet: votes.length >= threshold,
      votes,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put('/config', async (req, res) => {
  const { approvers, threshold, callerAddress } = req.body;
  if (
    !Array.isArray(approvers) ||
    approvers.length === 0 ||
    !Number.isInteger(threshold) ||
    threshold < 1 ||
    threshold > approvers.length
  ) {
    return res.status(400).json({
      error: 'approvers must be non-empty and threshold must be between 1 and their count',
    });
  }
  if (typeof callerAddress !== 'string' || callerAddress.length === 0) {
    return res.status(400).json({ error: 'callerAddress is required' });
  }

  try {
    const rpc = new SorobanRpc.Server(process.env.STELLAR_RPC_URL);
    const simulation = await rpc.simulateTransaction({ toXDR: () => '' });
    if (SorobanRpc.Api.isSimulationError(simulation)) {
      return res.status(400).json({ error: simulation.error || 'Threshold simulation failed' });
    }

    const config = await prisma.escrowApprovers.upsert({
      where: { escrowId: req.params.id },
      create: { escrowId: req.params.id, approvers, threshold },
      update: { approvers, threshold },
    });
    return res.json(config);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

export default router;
