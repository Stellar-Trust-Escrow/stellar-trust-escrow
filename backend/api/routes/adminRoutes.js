/**
 * Admin Routes
 *
 * All routes here require the adminAuth middleware (x-admin-api-key header).
 *
 * @module routes/adminRoutes
 */

import express from 'express';
const router = express.Router();
import adminAuth from '../middleware/adminAuth.js';
import adminController from '../controllers/adminController.js';

// Apply admin authentication to all routes in this file
router.use(adminAuth);

// ── Stats ──────────────────────────────────────────────────────────────────────
/**
 * @route  GET /api/admin/stats
 * @desc   Platform-wide statistics (total escrows, users, disputes)
 */
router.get('/stats', adminController.getStats);

// ── Users ──────────────────────────────────────────────────────────────────────
/**
 * @route  GET /api/admin/users
 * @desc   List all users with pagination & search
 * @query  page, limit, search
 */
router.get('/users', adminController.listUsers);

/**
 * @route  GET /api/admin/users/:address
 * @desc   Get detailed profile for a single user
 */
router.get('/users/:address', adminController.getUserDetail);

/**
 * @route  POST /api/admin/users/:address/suspend
 * @desc   Suspend a user; logs action to admin audit log
 * @body   { reason: string }
 */
router.post('/users/:address/suspend', adminController.suspendUser);

/**
 * @route  POST /api/admin/users/:address/ban
 * @desc   Permanently ban a user; logs action to admin audit log
 * @body   { reason: string }
 */
router.post('/users/:address/ban', adminController.banUser);

// ── Disputes ───────────────────────────────────────────────────────────────────
/**
 * @route  GET /api/admin/disputes
 * @desc   List all disputes with pagination
 * @query  page, limit, resolved (true|false)
 */
router.get('/disputes', adminController.listDisputes);

/**
 * @route  POST /api/admin/disputes/:id/resolve
 * @desc   Resolve an open dispute
 * @body   { clientAmount: string, freelancerAmount: string, notes: string }
 */
router.post('/disputes/:id/resolve', adminController.resolveDispute);

// ── Settings & Fees ────────────────────────────────────────────────────────────
/**
 * @route  GET /api/admin/settings
 * @desc   Read current platform settings
 */
router.get('/settings', adminController.getSettings);

/**
 * @route  PATCH /api/admin/settings
 * @desc   Update platform settings (fee percentage, etc.)
 * @body   { platformFeePercent: number }
 */
router.patch('/settings', adminController.updateSettings);

// ── Audit Logs ─────────────────────────────────────────────────────────────────
/**
 * @route  GET /api/admin/audit-logs
 * @desc   Paginated audit log of all admin actions
 * @query  page, limit
 */
router.get('/audit-logs', adminController.getAuditLogs);

// ── Rate Limits ────────────────────────────────────────────────────────────────
/**
 * @route  GET /api/admin/rate-limits
 * @desc   List all tier rate limit configurations
 */
router.get('/rate-limits', adminController.getRateLimits);

/**
 * @route  PATCH /api/admin/rate-limits/:tier
 * @desc   Update rate limit max for a specific tier
 * @body   { max: number }
 */
router.patch('/rate-limits/:tier', adminController.updateRateLimit);

/**
 * @route  GET /api/admin/rate-limits/usage/:userId
 * @desc   Get current usage analytics for a specific user
 */
router.get('/rate-limits/usage/:userId', adminController.getUserRateLimitUsage);

export default router;

// ── Secrets Management ─────────────────────────────────────────────────────────
import { getAuditLog, rotateSecrets } from '../../lib/secrets.js';

/**
 * @route  GET /api/admin/secrets/audit
 * @desc   Returns the in-process secrets access audit log.
 *         Wire to a SIEM or persistent store in production.
 */
router.get('/secrets/audit', (_req, res) => {
  res.json({ data: getAuditLog() });
});

/**
 * @route  POST /api/admin/secrets/rotate
 * @desc   Forces an immediate cache invalidation and re-fetch from the
 *         secrets backend. Use after rotating credentials in Vault.
 */
router.post('/secrets/rotate', async (_req, res) => {
  try {
    await rotateSecrets();
    res.json({ ok: true, message: 'Secrets rotated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Cache Management ───────────────────────────────────────────────────────────
import cache from '../../lib/cache.js';

/**
 * @route  GET /api/admin/cache/stats
 * @desc   Returns cache hit/miss analytics.
 */
router.get('/cache/stats', (_req, res) => {
  res.json(cache.analytics());
});

/**
 * @route  DELETE /api/admin/cache
 * @desc   Flush the entire cache (all tags and keys).
 * @body   { tag?: string, prefix?: string } — optional scope
 */
router.delete('/cache', async (req, res) => {
  try {
    const { tag, prefix } = req.body ?? {};
    if (tag) {
      await cache.invalidateTag(tag);
      return res.json({ ok: true, invalidated: `tag:${tag}` });
    }
    if (prefix) {
      await cache.invalidatePrefix(prefix);
      return res.json({ ok: true, invalidated: `prefix:${prefix}` });
    }
    // Full flush — invalidate all known top-level tags
    await cache.invalidateTags([
      'escrows', 'disputes', 'reputation', 'reputation:leaderboard',
      'events', 'events:stats', 'events:types', 'milestones',
    ]);
    res.json({ ok: true, invalidated: 'all' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
