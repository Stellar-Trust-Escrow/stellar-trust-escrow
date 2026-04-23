/**
 * HTTP Response Cache Middleware
 *
 * Drop-in Express middleware that caches GET responses and handles
 * cache invalidation for mutating requests.
 *
 * ## Usage
 *
 * ### Cache a route
 *
 *   import { cacheResponse } from '../middleware/cache.js';
 *
 *   router.get('/', cacheResponse({ ttl: 30, tags: ['escrows'] }), controller.list);
 *   router.get('/:id', cacheResponse({ ttl: 60, tags: req => [`escrow:${req.params.id}`] }), controller.get);
 *
 * ### Invalidate on mutation
 *
 *   import { invalidateOn } from '../middleware/cache.js';
 *
 *   router.post('/', invalidateOn({ tags: ['escrows'] }), controller.create);
 *   router.patch('/:id', invalidateOn({ tags: req => [`escrow:${req.params.id}`, 'escrows'] }), controller.update);
 *
 * ## Cache key
 *
 * Default: `http:<method>:<path>:<sorted-query-string>`
 * Override with the `keyFn` option.
 *
 * ## TTL configuration
 *
 * Per-route TTL via the `ttl` option (seconds).
 * Global defaults via environment variables:
 *
 *   CACHE_TTL_DEFAULT=60
 *   CACHE_TTL_LIST=15
 *   CACHE_TTL_DETAIL=30
 *   CACHE_TTL_LEADERBOARD=300
 *   CACHE_TTL_EVENTS=15
 *
 * @module middleware/cache
 */

import cache from '../../lib/cache.js';

// ── TTL presets (overridable via env) ─────────────────────────────────────────

export const TTL = {
  DEFAULT: parseInt(process.env.CACHE_TTL_DEFAULT || '60', 10),
  LIST: parseInt(process.env.CACHE_TTL_LIST || '15', 10),
  DETAIL: parseInt(process.env.CACHE_TTL_DETAIL || '30', 10),
  LEADERBOARD: parseInt(process.env.CACHE_TTL_LEADERBOARD || '300', 10),
  EVENTS: parseInt(process.env.CACHE_TTL_EVENTS || '15', 10),
  REPUTATION: parseInt(process.env.CACHE_TTL_REPUTATION || '60', 10),
  STATIC: parseInt(process.env.CACHE_TTL_STATIC || '600', 10),
};

// ── Key builder ───────────────────────────────────────────────────────────────

/**
 * Builds a deterministic cache key from the request.
 * Query params are sorted so ?b=2&a=1 and ?a=1&b=2 hit the same entry.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
export function buildCacheKey(req) {
  const sortedQuery = Object.keys(req.query)
    .sort()
    .map((k) => `${k}=${req.query[k]}`)
    .join('&');
  return `http:${req.method}:${req.path}${sortedQuery ? ':' + sortedQuery : ''}`;
}

// ── Cache response middleware ─────────────────────────────────────────────────

/**
 * @typedef {Object} CacheOptions
 * @property {number}                          [ttl]    — TTL in seconds (default: TTL.DEFAULT)
 * @property {string[]|(req)=>string[]}        [tags]   — invalidation tags
 * @property {(req)=>string}                   [keyFn]  — custom key builder
 * @property {(req,res)=>boolean}              [skip]   — return true to bypass cache
 */

/**
 * Middleware that serves cached responses for GET requests and stores
 * fresh responses in the cache after the controller runs.
 *
 * @param {CacheOptions} [options]
 * @returns {import('express').RequestHandler}
 */
export function cacheResponse(options = {}) {
  const {
    ttl = TTL.DEFAULT,
    tags = [],
    keyFn = buildCacheKey,
    skip,
  } = options;

  return async (req, res, next) => {
    // Only cache GET / HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    // Allow per-request bypass (e.g. authenticated writes, admin routes)
    if (skip && skip(req, res)) return next();

    const key = keyFn(req);

    // ── Cache hit ─────────────────────────────────────────────────────────────
    const cached = await cache.get(key);
    if (cached !== null) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Key', key);
      return res.json(cached);
    }

    res.setHeader('X-Cache', 'MISS');
    res.setHeader('X-Cache-Key', key);

    // ── Intercept res.json to store the response ──────────────────────────────
    const originalJson = res.json.bind(res);
    res.json = async (body) => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const resolvedTags = typeof tags === 'function' ? tags(req) : tags;
        await cache.setWithTags(key, body, ttl, resolvedTags);
      }
      return originalJson(body);
    };

    next();
  };
}

// ── Invalidation middleware ───────────────────────────────────────────────────

/**
 * @typedef {Object} InvalidateOptions
 * @property {string[]|(req)=>string[]}  [tags]     — tags to invalidate
 * @property {string[]|(req)=>string[]}  [keys]     — exact keys to invalidate
 * @property {string[]|(req)=>string[]}  [prefixes] — prefix patterns to invalidate
 * @property {'before'|'after'}          [when]     — 'before' (default) or 'after' the handler
 */

/**
 * Middleware that invalidates cache entries before or after a mutating request.
 *
 * @param {InvalidateOptions} [options]
 * @returns {import('express').RequestHandler}
 */
export function invalidateOn(options = {}) {
  const { tags = [], keys = [], prefixes = [], when = 'after' } = options;

  const doInvalidate = async (req) => {
    const resolvedTags = typeof tags === 'function' ? tags(req) : tags;
    const resolvedKeys = typeof keys === 'function' ? keys(req) : keys;
    const resolvedPrefixes = typeof prefixes === 'function' ? prefixes(req) : prefixes;

    await Promise.all([
      resolvedTags.length ? cache.invalidateTags(resolvedTags) : Promise.resolve(),
      ...resolvedKeys.map((k) => cache.invalidate(k)),
      ...resolvedPrefixes.map((p) => cache.invalidatePrefix(p)),
    ]);
  };

  if (when === 'before') {
    return async (req, _res, next) => {
      await doInvalidate(req);
      next();
    };
  }

  // 'after' — invalidate once the response has been sent
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        doInvalidate(req).catch((err) =>
          console.error('[Cache] Post-response invalidation failed:', err.message),
        );
      }
    });
    next();
  };
}

// ── Convenience factories ─────────────────────────────────────────────────────

/** Cache a list endpoint (short TTL, tagged with a collection name). */
export const cacheList = (collection, ttl = TTL.LIST) =>
  cacheResponse({ ttl, tags: [collection] });

/** Cache a detail endpoint (medium TTL, tagged with item + collection). */
export const cacheDetail = (collection, idFn, ttl = TTL.DETAIL) =>
  cacheResponse({
    ttl,
    tags: (req) => [collection, `${collection}:${idFn(req)}`],
  });

/** Invalidate a collection and optionally a specific item. */
export const invalidateCollection = (collection, idFn = null) =>
  invalidateOn({
    tags: (req) => [
      collection,
      ...(idFn ? [`${collection}:${idFn(req)}`] : []),
    ],
  });
