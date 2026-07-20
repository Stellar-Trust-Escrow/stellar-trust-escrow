import express from 'express';
import approvalController from '../controllers/approvalController.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();
router.use(authMiddleware);

router.post('/', approvalController.createRequest);
router.get('/', approvalController.listRequests);
router.get('/:requestId', approvalController.getRequest);
router.post('/:requestId/approve', approvalController.approve);
router.post('/:requestId/reject', approvalController.reject);

export default router;
