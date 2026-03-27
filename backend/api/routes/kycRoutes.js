import express from 'express';
import adminAuth from '../middleware/adminAuth.js';
import kycController from '../controllers/kycController.js';
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

router.post(
  '/token',
  stellarAddressBody('address'),
  handleValidationErrors,
  kycController.getToken,
);
router.get(
  '/status/:address',
  stellarAddressParam('address'),
  handleValidationErrors,
  kycController.getStatus,
);
router.post('/webhook', captureRawBody, express.json(), kycController.webhook);
router.get('/admin', adminAuth, kycController.adminList);

export default router;
