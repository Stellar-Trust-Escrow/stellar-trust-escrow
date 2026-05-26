import express from 'express';
import authController from '../controllers/authController.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/revoke-all', authMiddleware, authController.revokeAll);
router.get('/sessions', authMiddleware, authController.sessions);

export default router;
