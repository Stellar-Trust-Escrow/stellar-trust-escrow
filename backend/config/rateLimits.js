/**
 * Tier-based rate limit configuration.
 * Each tier defines max requests per windowMs and burst limits.
 */
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export const TIER_LIMITS = {
  free: 60,
  basic: 120,
  premium: 300,
  enterprise: 1000,
  admin: 5000,
};

/** Max requests allowed in a single burst window before spike-rejection kicks in. */
export const BURST_WINDOW_MS = 1000; // 1 second

export const BURST_LIMITS = {
  free: 10,
  basic: 20,
  premium: 50,
  enterprise: 150,
  admin: 500,
};

export const DEFAULT_TIER = 'free';

/**
 * Returns the rate limit max for a given tier.
 * Falls back to free tier if unknown.
 */
export function getLimitForTier(tier) {
  return TIER_LIMITS[tier] ?? TIER_LIMITS[DEFAULT_TIER];
}

/**
 * Returns the burst limit for a given tier.
 * Falls back to free tier if unknown.
 */
export function getBurstLimitForTier(tier) {
  return BURST_LIMITS[tier] ?? BURST_LIMITS[DEFAULT_TIER];
}

// ── Route-tier limits ─────────────────────────────────────────────────────────
// Applied per route group regardless of user tier.

/** Auth endpoints — strict: 10 requests per minute */
export const AUTH_ROUTE_LIMIT = 10;

/** Write endpoints (POST/PUT/PATCH/DELETE) — moderate: 60 requests per minute */
export const WRITE_ROUTE_LIMIT = 60;

/** Read endpoints (GET) — relaxed: 300 requests per minute */
export const READ_ROUTE_LIMIT = 300;
