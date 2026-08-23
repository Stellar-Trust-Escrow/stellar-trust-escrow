import express from 'express';
import { status } from '../controllers/featureFlagController.js';

const router = express.Router();

/** GET /api/v1/flags/:key/status */
router.get('/:key/status', status);

export default router;
