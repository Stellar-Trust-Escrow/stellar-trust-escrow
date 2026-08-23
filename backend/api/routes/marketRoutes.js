import express from 'express';
import marketController from '../controllers/marketController.js';

const router = express.Router();

/** GET /api/v1/market/xlm-usd */
router.get('/xlm-usd', marketController.getXlmUsd);

export default router;
