/**
 * Cache — delegates to cacheService (Redis + in-memory fallback).
 *
 * Existing controllers call cache.get/set/invalidate/invalidatePrefix
 * synchronously — those calls now return Promises. Controllers that
 * already await them work as-is; controllers that don't will fire-and-forget
 * on set/invalidate (acceptable for a cache layer).
 */

import cacheService from '../services/cacheService.js';

export default cacheService;
