import express from 'express';
import { getPreferences, updatePreferences } from '../controllers/notificationController.js';
import { requireAuth } from '../middleware/auth.js'; // Assuming there's a middleware

const router = express.Router();

router.get('/preferences', requireAuth, getPreferences);
router.put('/preferences', requireAuth, updatePreferences);

export default router;
