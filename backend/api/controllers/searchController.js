/**
 * Search Controller
 *
 * Handles full-text search, suggestions, index management, and analytics
 * for the /api/search endpoints.
 *
 * @module controllers/searchController
 */

import searchService from '../../services/searchService.js';
import prisma from '../../lib/prisma.js';
import { parsePagination } from '../../lib/pagination.js';

const VALID_SORT_FIELDS = ['createdAt', 'totalAmount', 'status'];
const VALID_SORT_ORDERS = ['asc', 'desc'];

/**
 * GET /api/search
 *
 * Query params:
 *   q           - free-text search term
 *   status      - comma-separated: Active,Completed,Disputed,Cancelled
 *   client      - exact client Stellar address
 *   freelancer  - exact freelancer Stellar address
 *   minAmount   - numeric
 *   maxAmount   - numeric
 *   dateFrom    - ISO date
 *   dateTo      - ISO date
 *   sortBy      - createdAt | totalAmount | status
 *   sortOrder   - asc | desc
 *   page        - default 1
 *   limit       - default 20, max 100
 */
const searchEscrows = async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const {
      q,
      status,
      client,
      freelancer,
      minAmount,
      maxAmount,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const resolvedSortBy = VALID_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';
    const resolvedSortOrder = VALID_SORT_ORDERS.includes(sortOrder) ? sortOrder : 'desc';

    const results = await searchService.search({
      q,
      status,
      client,
      freelancer,
      minAmount: minAmount !== undefined ? Number(minAmount) : undefined,
      maxAmount: maxAmount !== undefined ? Number(maxAmount) : undefined,
      dateFrom,
      dateTo,
      sortBy: resolvedSortBy,
      sortOrder: resolvedSortOrder,
      page,
      limit,
    });

    res.json(results);
  } catch (err) {
    console.error('[Search] searchEscrows error:', err.message);
    res.status(500).json({ error: 'Search unavailable', detail: err.message });
  }
};

/**
 * GET /api/search/suggest?q=<prefix>&size=<n>
 *
 * Returns completion suggestions for the given prefix.
 */
const getSuggestions = async (req, res) => {
  try {
    const { q, size = '5' } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'q is required' });
    }

    const suggestions = await searchService.suggest(q.trim(), Math.min(parseInt(size, 10) || 5, 20));
    res.json({ suggestions });
  } catch (err) {
    console.error('[Search] getSuggestions error:', err.message);
    res.status(500).json({ error: 'Suggestions unavailable', detail: err.message });
  }
};

/**
 * GET /api/search/analytics
 *
 * Returns search analytics: total searches, top queries, zero-result queries.
 * Admin-only — protected by adminAuth middleware in the router.
 */
const getAnalytics = (_req, res) => {
  try {
    const analytics = searchService.getAnalytics();
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/search/reindex
 *
 * Drops and rebuilds the Elasticsearch index from the database.
 * Admin-only — protected by adminAuth middleware in the router.
 */
const reindex = async (_req, res) => {
  try {
    const result = await searchService.reindex(prisma);
    res.json({ message: 'Reindex complete', ...result });
  } catch (err) {
    console.error('[Search] reindex error:', err.message);
    res.status(500).json({ error: 'Reindex failed', detail: err.message });
  }
};

export default { searchEscrows, getSuggestions, getAnalytics, reindex };
