import express from 'express';
import { getNonce, verifySignatureAndLogin, refreshToken, logout } from '../controllers/authController.js';

const router = express.Router();

/** POST /api/auth/nonce — request a challenge nonce */
router.post('/nonce', getNonce);

/** POST /api/auth/verify — submit signed nonce, receive JWT */
router.post('/verify', verifySignatureAndLogin);

/** POST /api/auth/refresh — refresh a valid JWT */
router.post('/refresh', refreshToken);

/** POST /api/auth/logout */
router.post('/logout', logout);
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
