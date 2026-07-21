import express from 'express';
import authMiddleware from '../middleware/auth.js';
import { estimateFees, getFeeStats, bumpFee } from '../controllers/gasController.js';

const router = express.Router();

router.get('/estimate', estimateFees);
router.get('/stats', getFeeStats);
router.post('/bump', authMiddleware, bumpFee);

export default router;
