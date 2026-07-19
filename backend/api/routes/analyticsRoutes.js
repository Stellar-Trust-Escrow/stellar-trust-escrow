import express from 'express';
const router = express.Router();
import adminAuth from '../middleware/adminAuth.js';
import analyticsController from '../controllers/analyticsController.js';

// Apply admin authentication to all routes
router.use(adminAuth);

/**
 * @route GET /api/v1/admin/analytics/volume
 * @desc Volume area chart data (funded, completed, disputed)
 */
router.get('/volume', analyticsController.getVolume);

/**
 * @route GET /api/v1/admin/analytics/dispute-rate
 * @desc Dispute rate over time
 */
router.get('/dispute-rate', analyticsController.getDisputeRate);

/**
 * @route GET /api/v1/admin/analytics/resolution-time
 * @desc Resolution time percentiles and histogram
 */
router.get('/resolution-time', analyticsController.getResolutionTime);

/**
 * @route GET /api/v1/admin/analytics/cohort
 * @desc Cohort retention percentage over 8 weeks
 */
router.get('/cohort', analyticsController.getCohortRetention);

export default router;
