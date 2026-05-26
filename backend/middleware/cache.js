/**
 * HTTP Response Cache Middleware
 *
 * Caches GET responses in Redis/memory by URL.
 * Sets X-Cache: HIT|MISS header for observability.
 *
 * Usage:
 *   router.get('/path', cacheResponse(TTL.LIST), handler)
 *   router.get('/path/:id', cacheResponse(TTL.DETAIL, (req) => \`custom:\${req.params.id}\`), handler)
 */

import cache from '../../lib/cache.js';

export const TTL = {
  LIST: 300,   // 5 minutes for escrow lists
  DETAIL: 900, // 15 minutes for individual escrows
};

/**
 * @param {number} ttlSeconds
 * @param {(req: import('express').Request) => string} [keyFn]
 */
export default function cacheMiddleware(ttlSeconds = 60, keyFn) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    const key = keyFn ? keyFn(req) : `http:${req.originalUrl}`;

    const cached = await cache.get(key);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(cached);
    }

    res.setHeader('X-Cache', 'MISS');

    // Intercept res.json to store the response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        cache.set(key, body, ttlSeconds);
      }
      return originalJson(body);
    };

    next();
  };
}
