import express from 'express';
import templateController from '../controllers/templateController.js';
import authMiddleware from '../middleware/auth.js';

const router = express.Router();

// Saving, listing (own), updating and deleting require an authenticated user.
// Fetching a single template is publicly readable when the template is public
// (the gateway already allows unauthenticated GETs for this route prefix); the
// controller still enforces a 403 for private templates accessed by non-owners.
router.post('/', authMiddleware, templateController.saveTemplate);
router.get('/', templateController.listTemplates);
router.get('/:id', templateController.getTemplate);
router.put('/:id', authMiddleware, templateController.updateTemplate);
router.delete('/:id', authMiddleware, templateController.deleteTemplate);
router.post('/:id/use', templateController.useTemplate);

export default router;
