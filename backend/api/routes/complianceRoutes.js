import express from 'express';
import adminAuth from '../middleware/adminAuth.js';
import complianceController from '../controllers/complianceController.js';

const router = express.Router();
router.use(adminAuth);

router.get('/reports/:type', complianceController.generateReport);
router.get('/reports/:type/export', complianceController.exportReport);
router.get('/schedules', complianceController.listSchedules);
router.post('/schedules', complianceController.createSchedule);
router.post('/schedules/:id/run', complianceController.runSchedule);
router.patch('/schedules/:id/disable', complianceController.disableSchedule);

export default router;
