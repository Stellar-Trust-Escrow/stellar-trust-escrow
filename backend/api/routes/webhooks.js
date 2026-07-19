import express from 'express';

import webhookController from '../controllers/webhookController.js';
import adminAuth from '../middleware/adminAuth.js';
import { createSlidingWindowRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

const createRateLimit = createSlidingWindowRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  prefix: 'webhook-endpoint-create',
  keyGenerator: (req) =>
    req.user?.address
      ? `webhook-endpoint:addr:${req.user.address}`
      : `webhook-endpoint:ip:${req.ip ?? 'unknown'}`,
  message: 'Too many webhook endpoint requests — try again later',
});

router.post('/', createRateLimit, webhookController.createEndpoint);
router.get('/:id/deliveries', webhookController.getDeliveries);
router.post('/:id/redeliver/:deliveryId', adminAuth, webhookController.redeliver);

export default router;
