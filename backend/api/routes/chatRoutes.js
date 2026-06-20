import express from 'express';
import authMiddleware from '../middleware/auth.js';
import { distributeRoomKey, getRoomKey, sendMessage, getMessages } from '../controllers/chatController.js';

const router = express.Router();
router.use(authMiddleware);

router.post('/:escrowId/room-key', distributeRoomKey);
router.get('/:escrowId/room-key', getRoomKey);
router.post('/:escrowId/messages', sendMessage);
router.get('/:escrowId/messages', getMessages);

export default router;
