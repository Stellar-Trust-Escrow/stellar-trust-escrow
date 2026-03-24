import express from 'express';
import eventController from '../controllers/eventController.js';

const router = express.Router();

/**
 * @route  GET /api/events/types
 * @desc   List distinct event types present in the index.
 */
router.get('/types', eventController.listEventTypes);

/**
 * @route  GET /api/events/stats
 * @desc   Aggregate event counts per type.
 */
router.get('/stats', eventController.getEventStats);

/**
 * @route  GET /api/events/escrow/:escrowId
 * @desc   List all indexed events for a specific escrow (chronological order).
 * @query  eventType, page, limit
 */
router.get('/escrow/:escrowId', eventController.listEscrowEvents);

/**
 * @route  GET /api/events/:id
 * @desc   Get a single indexed event by database ID.
 */
router.get('/:id', eventController.getEvent);

/**
 * @route  GET /api/events
 * @desc   List all indexed events with optional filters.
 * @query  eventType, escrowId, fromLedger, toLedger, page, limit
 */
router.get('/', eventController.listEvents);

export default router;
