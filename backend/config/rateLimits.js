/**
 * Tier-based rate limit configuration.
 * Each tier defines max requests per windowMs.
 */
export const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export const TIER_LIMITS = {
  free: 60,
  basic: 120,
  premium: 300,
  enterprise: 1000,
  admin: 5000,
};

export const DEFAULT_TIER = 'free';

/**
 * Returns the rate limit max for a given tier.
 * Falls back to free tier if unknown.
 */
export function getLimitForTier(tier) {
  return TIER_LIMITS[tier] ?? TIER_LIMITS[DEFAULT_TIER];
}
