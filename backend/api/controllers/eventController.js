/**
 * Event Controller
 *
 * Query API for indexed smart contract events.
 * All endpoints return the standard paginated envelope.
 *
 * @module eventController
 */

import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';

const EVENT_TTL = 15; // seconds — events are append-only so short TTL is fine

/**
 * GET /api/events
 * List all indexed events with optional filters.
 *
 * @query {string}  eventType  — filter by event type (e.g. "esc_crt")
 * @query {string}  escrowId   — filter by escrow ID
 * @query {number}  fromLedger — only events at or after this ledger
 * @query {number}  toLedger   — only events at or before this ledger
 * @query {number}  page
 * @query {number}  limit
 */
const listEvents = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { eventType, escrowId, fromLedger, toLedger } = req.query;

    const where = {};
    if (eventType) where.eventType = eventType;
    if (escrowId) {
      try {
        where.escrowId = BigInt(escrowId);
      } catch {
        return res.status(400).json({ error: 'Invalid escrowId' });
      }
    }
    if (fromLedger || toLedger) {
      where.ledger = {};
      if (fromLedger) where.ledger.gte = BigInt(fromLedger);
      if (toLedger) where.ledger.lte = BigInt(toLedger);
    }

    const cacheKey = `events:list:${JSON.stringify({ where, page, limit })}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [data, total] = await prisma.$transaction([
      prisma.contractEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { ledgerAt: 'desc' },
        select: {
          id: true,
          ledger: true,
          ledgerAt: true,
          contractId: true,
          eventType: true,
          escrowId: true,
          topics: true,
          data: true,
          txHash: true,
          eventIndex: true,
        },
      }),
      prisma.contractEvent.count({ where }),
    ]);

    const result = buildPaginatedResponse(
      data.map(serializeEvent),
      { total, page, limit },
    );
    const result = buildPaginatedResponse(data.map(serializeEvent), { total, page, limit });
    cache.set(cacheKey, result, EVENT_TTL);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/events/:id
 * Get a single indexed event by its database ID.
 */
const getEvent = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid event id' });

    const cacheKey = `events:${id}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const event = await prisma.contractEvent.findUnique({ where: { id } });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const result = serializeEvent(event);
    cache.set(cacheKey, result, 300);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/events/escrow/:escrowId
 * List all events for a specific escrow, ordered chronologically.
 */
const listEscrowEvents = async (req, res) => {
  try {
    let escrowId;
    try {
      escrowId = BigInt(req.params.escrowId);
    } catch {
      return res.status(400).json({ error: 'Invalid escrow id' });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const { eventType } = req.query;

    const where = { escrowId };
    if (eventType) where.eventType = eventType;

    const cacheKey = `events:escrow:${escrowId}:${eventType ?? ''}:${page}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [data, total] = await prisma.$transaction([
      prisma.contractEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { ledgerAt: 'asc' },
      }),
      prisma.contractEvent.count({ where }),
    ]);

    const result = buildPaginatedResponse(data.map(serializeEvent), { total, page, limit });
    cache.set(cacheKey, result, EVENT_TTL);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/events/types
 * Returns the list of distinct event types present in the index.
 * Useful for building filter UIs.
 */
const listEventTypes = async (_req, res) => {
  try {
    const cacheKey = 'events:types';
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const rows = await prisma.contractEvent.findMany({
      distinct: ['eventType'],
      select: { eventType: true },
      orderBy: { eventType: 'asc' },
    });

    const result = rows.map((r) => r.eventType);
    cache.set(cacheKey, result, 60);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/events/stats
 * Returns aggregate counts per event type — useful for dashboards.
 */
const getEventStats = async (_req, res) => {
  try {
    const cacheKey = 'events:stats';
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const rows = await prisma.contractEvent.groupBy({
      by: ['eventType'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });

    const result = rows.map((r) => ({ eventType: r.eventType, count: r._count.id }));
    cache.set(cacheKey, result, 30);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Serialiser ───────────────────────────────────────────────────────────────

/** Converts BigInt fields to strings for JSON serialisation. */
const serializeEvent = (event) => ({
  ...event,
  ledger: event.ledger?.toString(),
  escrowId: event.escrowId?.toString() ?? null,
});

export default { listEvents, getEvent, listEscrowEvents, listEventTypes, getEventStats };
