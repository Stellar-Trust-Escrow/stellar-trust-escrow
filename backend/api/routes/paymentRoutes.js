import express from 'express';
import paymentController from '../controllers/paymentController.js';
import {
  stellarAddressParam,
  stellarAddressBody,
  handleValidationErrors,
} from '../../middleware/validation.js';

const router = express.Router();

const captureRawBody = (req, _res, next) => {
  let data = '';
  req.on('data', (chunk) => (data += chunk));
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
};

router.post('/webhook', captureRawBody, express.json(), paymentController.webhook);
router.post(
  '/checkout',
  stellarAddressBody('address'),
  handleValidationErrors,
  paymentController.createCheckout,
);
router.get('/status/:sessionId', paymentController.getStatus);
router.get(
  '/:address',
  stellarAddressParam('address'),
  handleValidationErrors,
  paymentController.listByAddress,
);
router.post('/:paymentId/refund', paymentController.refund);

export default router;
