import express from 'express';
import escrowController, {
  validateBroadcast,
  validateEscrowId,
  validatePagination,
} from '../controllers/escrowController.js';

const router = express.Router();

router.get('/', validatePagination, escrowController.listEscrows);
router.post('/broadcast', validateBroadcast, escrowController.broadcastCreateEscrow);
router.get('/:id/milestones', validateEscrowId, validatePagination, escrowController.getMilestones);
router.get('/:id/milestones/:milestoneId', validateEscrowId, escrowController.getMilestone);
router.get('/:id', validateEscrowId, escrowController.getEscrow);

export default router;
