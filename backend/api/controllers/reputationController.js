/**
 * Reputation Controller
 *
 * - getReputation   — single address lookup (Prisma, cached)
 * - getLeaderboard  — top-N by score (ES primary, Prisma fallback, cached)
 * - search          — address autocomplete + full-text (ES primary, Prisma fallback)
 *
 * Cache handled by route-level middleware — no manual cache calls here.
 */

import prisma from '../../lib/prisma.js';
import { buildPaginatedResponse, parsePagination } from '../../lib/pagination.js';
import * as reputationSearch from '../../services/reputationSearchService.js';

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

const getReputation = async (req, res) => {
  try {
    const { address } = req.params;
    if (!STELLAR_ADDRESS_RE.test(address)) {
      return res.status(400).json({ error: 'Invalid Stellar address' });
    }
    const record = await prisma.reputationRecord.findUnique({ where: { address } });
    res.json(record ?? {
      address, totalScore: 0, completedEscrows: 0,
      disputedEscrows: 0, disputesWon: 0, totalVolume: '0', lastUpdated: null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getLeaderboard = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const tenantId = req.tenant?.id;

    const { hits, total, source } = await reputationSearch.leaderboard({
      tenantId, limit, from: skip,
    });

    const data = hits.map((r, i) => ({
      rank: skip + i + 1,
      address: `${r.address.slice(0, 6)}...${r.address.slice(-4)}`,
      fullAddress: r.address,
      totalScore: r.total_score ?? r.totalScore,
      completedEscrows: r.completed_escrows ?? r.completedEscrows,
      disputesWon: r.disputes_won ?? r.disputesWon,
      totalVolume: r.total_volume ?? r.totalVolume,
    }));

    res.set('X-Data-Source', source);
    res.json(buildPaginatedResponse(data, { total, page, limit }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/reputation/search?q=<prefix>&limit=<n>&from=<offset>
 *
 * Address autocomplete and full-text search.
 * Returns results in <50ms from ES; falls back to Prisma on ES outage.
 */
const search = async (req, res) => {
  try {
    const q = (req.query.q ?? '').trim();
    const limit = Math.min(parseInt(req.query.limit ?? '10', 10), 50);
    const from = parseInt(req.query.from ?? '0', 10);
    const tenantId = req.tenant?.id;

    const { hits, total, source } = await reputationSearch.search(q, {
      tenantId, limit, from,
    });

    res.set('X-Data-Source', source);
    res.json({ data: hits, total, limit, from });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { getReputation, getLeaderboard, search };
