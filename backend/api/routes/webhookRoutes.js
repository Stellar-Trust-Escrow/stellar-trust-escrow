import express from 'express';
import webhookController from '../controllers/webhookController.js';

const router = express.Router();

router.post('/subscribe', webhookController.subscribe);
router.get('/', webhookController.listSubscriptions);
router.delete('/:id', webhookController.deleteSubscription);
router.get('/:id/deliveries', webhookController.getDeliveries);

export default router;
