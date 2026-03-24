/**
 * Metrics & Health Routes
 *
 * GET /metrics  — Prometheus text format (protected by METRICS_TOKEN if set)
 * GET /health   — Enhanced liveness/readiness check
 */

/* eslint-disable no-undef */
import express from 'express';
import { register, cacheSize } from '../../lib/metrics.js';
import cache from '../../lib/cache.js';

const router = express.Router();

// ── Optional bearer-token protection for /metrics ─────────────────────────────
function metricsAuth(req, res, next) {
  const token = process.env.METRICS_TOKEN;
  if (!token) return next(); // no token configured → open (fine for internal networks)

  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${token}`) return next();

  res.status(401).json({ error: 'Unauthorized' });
}

// ── GET /metrics ──────────────────────────────────────────────────────────────
router.get('/', metricsAuth, async (_req, res) => {
  try {
    // Keep cache size gauge in sync
    cacheSize.set(cache.size());

    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

export default router;
