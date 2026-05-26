import express from 'express';
import authController from '../controllers/authController.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

router.post('/nonce',   authController.getNonce);
router.post('/verify',  authController.verifySignatureAndLogin);
router.post('/refresh', authController.refreshToken);
router.post('/logout',  authController.logout);

router.get('/sessions',          authMiddleware, authController.listSessions);
router.delete('/sessions',       authMiddleware, authController.revokeAllSessions);
router.delete('/sessions/:jti',  authMiddleware, authController.revokeSession);

export default router;
