import express from 'express';
import {
  getOwnership,
  offerTransfer,
  acceptTransfer,
  cancelTransfer,
} from '../controllers/ownershipController.js';

const router = express.Router({ mergeParams: true });

router.get('/', getOwnership);
router.post('/offer', offerTransfer);
router.post('/accept', acceptTransfer);
router.post('/cancel', cancelTransfer);

export default router;
