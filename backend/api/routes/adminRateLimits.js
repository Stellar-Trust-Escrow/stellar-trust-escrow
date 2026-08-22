import express from 'express';

const router = express.Router();

const _stats = { topIPs: [], topWallets: [], lastUpdated: null };

export function recordRateLimitHit(type, identifier) {
  const list = type === 'ip' ? _stats.topIPs : _stats.topWallets;
  const existing = list.find(e => e.identifier === identifier);
  if (existing) {
    existing.hits++;
    existing.lastHit = new Date();
  } else {
    list.push({ identifier, hits: 1, lastHit: new Date() });
  }
  list.sort((a, b) => b.hits - a.hits);
  if (list.length > 10) list.splice(10);
  _stats.lastUpdated = new Date();
}

router.get('/rate-limits', (req, res) => {
  res.json({
    topRateLimitedIPs: _stats.topIPs.slice(0, 10),
    topRateLimitedWallets: _stats.topWallets.slice(0, 10),
    lastUpdated: _stats.lastUpdated,
  });
});

export default router;
