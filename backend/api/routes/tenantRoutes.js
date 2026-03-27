import express from 'express';
import tenantController from '../controllers/tenantController.js';

const router = express.Router();

router.get('/', tenantController.getCurrentTenant);

export default router;
