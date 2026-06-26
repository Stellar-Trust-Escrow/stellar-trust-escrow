import express from 'express';
import webhookController from '../controllers/webhookController.js';
import { createSlidingWindowRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Webhook subscriptions are write operations that provision persistent server
// resources. A single authenticated user could otherwise flood the table with
// thousands of subscriptions in seconds. 10 per 10-minute window is generous
// for legitimate use while making enumeration / DoS impractical.
const subscribeRateLimit = createSlidingWindowRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  prefix: 'webhook-subscribe',
  keyGenerator: (req) =>
    req.user?.address
      ? `webhook-subscribe:addr:${req.user.address}`
      : `webhook-subscribe:ip:${req.ip ?? 'unknown'}`,
  message: 'Too many webhook subscription requests — try again later',
});

router.post('/subscribe', subscribeRateLimit, webhookController.subscribe);
router.get('/', webhookController.listSubscriptions);
router.post('/rotate-secret', webhookController.rotateSecret);
router.post('/:id/rotate-secret', webhookController.rotateSecret);
router.delete('/:id', webhookController.deleteSubscription);
router.get('/:id/deliveries', webhookController.getDeliveries);

export default router;
