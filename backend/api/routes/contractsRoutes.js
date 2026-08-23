import express from 'express';
import contractsController from '../controllers/contractsController.js';

const router = express.Router();

/** GET /api/v1/contracts/addresses */
router.get('/addresses', contractsController.getAddresses);

/** GET /api/v1/contracts/status */
router.get('/status', contractsController.getStatus);

export default router;
