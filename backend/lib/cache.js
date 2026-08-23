/**
 * Cache — Three-tier caching (L1 LRU + L2 Redis + L3 Prisma fallback).
 *
 * Existing controllers call cache.get/set/invalidate/invalidatePrefix
 * synchronously — those calls now return Promises. Controllers that
 * already await them work as-is; controllers that don't will fire-and-forget
 * on set/invalidate (acceptable for a cache layer).
 *
 * New code should use cache.get(key, loader, options) for three-tier
 * read-through caching with automatic L3 fallback.
 */

import { cacheManager } from './cacheManager.js';

export default cacheManager;
