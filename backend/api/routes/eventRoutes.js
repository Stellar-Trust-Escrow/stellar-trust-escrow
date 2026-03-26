import express from 'express';
import eventController from '../controllers/eventController.js';
import { cacheResponse, TTL } from '../middleware/cache.js';

const router = express.Router();

// Event data is append-only — short TTL is fine, no invalidation needed.

router.get(
  '/types',
  cacheResponse({ ttl: TTL.STATIC, tags: ['events:types'] }),
  eventController.listEventTypes,
);

router.get(
  '/stats',
  cacheResponse({ ttl: TTL.EVENTS, tags: ['events:stats'] }),
  eventController.getEventStats,
);

router.get(
  '/escrow/:escrowId',
  cacheResponse({
    ttl: TTL.EVENTS,
    tags: (req) => ['events', `events:escrow:${req.params.escrowId}`],
  }),
  eventController.listEscrowEvents,
);

router.get(
  '/:id',
  cacheResponse({
    ttl: TTL.STATIC,
    tags: (req) => [`event:${req.params.id}`],
  }),
  eventController.getEvent,
);

router.get(
  '/',
  cacheResponse({ ttl: TTL.EVENTS, tags: ['events'] }),
  eventController.listEvents,
);

export default router;
