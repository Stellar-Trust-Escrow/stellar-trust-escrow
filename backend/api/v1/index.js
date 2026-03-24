import express from 'express';
import { versioning } from '../middleware/version.js';

import disputeRoutes from '../routes/disputeRoutes.js';
import escrowRoutes from '../routes/escrowRoutes.js';
import eventRoutes from '../routes/eventRoutes.js';
import kycRoutes from '../routes/kycRoutes.js';
import notificationRoutes from '../routes/notificationRoutes.js';
import paymentRoutes from '../routes/paymentRoutes.js';
import reputationRoutes from '../routes/reputationRoutes.js';
import userRoutes from '../routes/userRoutes.js';
import auditRoutes from '../routes/auditRoutes.js';

const router = express.Router();

// Apply v1 versioning to all routes in this router
router.use(versioning('v1'));

router.use('/escrows', escrowRoutes);
router.use('/users', userRoutes);
router.use('/reputation', reputationRoutes);
router.use('/disputes', disputeRoutes);
router.use('/notifications', notificationRoutes);
router.use('/events', eventRoutes);
router.use('/kyc', kycRoutes);
router.use('/payments', paymentRoutes);
router.use('/audit', auditRoutes);

export default router;
