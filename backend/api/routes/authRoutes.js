import express from 'express';
import authController from '../controllers/authController.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

/** POST /api/auth/nonce — request a challenge nonce */
router.post('/nonce', authController.getNonce);

/** POST /api/auth/verify — submit signed nonce, receive JWT */
router.post('/verify', authController.verifySignatureAndLogin);

/** POST /api/auth/refresh — refresh a valid JWT */
router.post('/refresh', authController.refreshToken);

/** POST /api/auth/logout */
router.post('/logout', authController.logout);

/** Session management */
router.get('/sessions', authMiddleware, authController.listSessions);
router.delete('/sessions/:id', authMiddleware, authController.revokeSession);
router.delete('/sessions', authMiddleware, authController.revokeAllSessions);

export default router;
