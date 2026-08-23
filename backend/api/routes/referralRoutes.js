import express from 'express';
import referralController from '../controllers/referralController.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

/** POST /api/v1/referrals/codes */
router.post('/codes', authMiddleware, referralController.createCode);

/** GET /api/v1/referrals/my-stats */
router.get('/my-stats', authMiddleware, referralController.getMyStats);

export default router;
