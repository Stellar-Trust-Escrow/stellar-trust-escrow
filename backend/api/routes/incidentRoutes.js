/**
 * Incident Routes — all protected by adminAuth
 */

import express from 'express';
import adminAuth from '../middleware/adminAuth.js';
import incidentController from '../controllers/incidentController.js';

const router = express.Router();
router.use(adminAuth);

/** GET  /api/incidents           — list all incidents */
router.get('/', incidentController.listIncidents);

/** GET  /api/incidents/oncall    — current on-call engineer */
router.get('/oncall', incidentController.getOnCall);

/** POST /api/incidents           — create a new incident */
router.post('/', incidentController.createIncident);

/** GET  /api/incidents/:id       — get incident detail */
router.get('/:id', incidentController.getIncident);

/** PATCH /api/incidents/:id/status — transition status */
router.patch('/:id/status', incidentController.updateStatus);

/** POST /api/incidents/:id/post-mortem — attach post-mortem */
router.post('/:id/post-mortem', incidentController.attachPostMortem);

export default router;
