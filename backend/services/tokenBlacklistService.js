/**
 * Token Blacklist Service
 * 
 * Provides Redis-based token blacklisting for immediate revocation of compromised tokens.
 * Supports both access tokens and refresh tokens with TTL-based expiration.
 */

import crypto from 'crypto';
import cacheService from './cacheService.js';

const BLACKLIST_PREFIX = 'blacklist:';
const ACCESS_TOKEN_TTL = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days

/**
 * Create a SHA-256 hash of a token for secure storage
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Add a token to the blacklist
 * @param {string} token - The JWT token to blacklist
 * @param {string} type - 'access' or 'refresh'
 * @param {string} reason - Reason for blacklisting
 */
async function blacklistToken(token, type = 'access', reason = 'compromised') {
  const tokenHash = hashToken(token);
  const key = `${BLACKLIST_PREFIX}${type}:${tokenHash}`;
  
  const ttl = type === 'access' ? ACCESS_TOKEN_TTL : REFRESH_TOKEN_TTL;
  const metadata = {
    blacklistedAt: new Date().toISOString(),
    reason,
    type,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString()
  };

  await cacheService.set(key, metadata, ttl);
  
  console.log(`[TokenBlacklist] Token blacklisted: ${type} - ${reason}`);
  return true;
}

/**
 * Check if a token is blacklisted
 * @param {string} token - The JWT token to check
 * @param {string} type - 'access' or 'refresh'
 */
async function isTokenBlacklisted(token, type = 'access') {
  const tokenHash = hashToken(token);
  const key = `${BLACKLIST_PREFIX}${type}:${tokenHash}`;
  
  const blacklisted = await cacheService.get(key);
  return blacklisted !== null;
}

/**
 * Get blacklist metadata for a token
 * @param {string} token - The JWT token
 * @param {string} type - 'access' or 'refresh'
 */
async function getBlacklistMetadata(token, type = 'access') {
  const tokenHash = hashToken(token);
  const key = `${BLACKLIST_PREFIX}${type}:${tokenHash}`;
  
  return await cacheService.get(key);
}

/**
 * Remove a token from the blacklist (if needed)
 * @param {string} token - The JWT token to remove
 * @param {string} type - 'access' or 'refresh'
 */
async function removeFromBlacklist(token, type = 'access') {
  const tokenHash = hashToken(token);
  const key = `${BLACKLIST_PREFIX}${type}:${tokenHash}`;
  
  await cacheService.invalidate(key);
  console.log(`[TokenBlacklist] Token removed from blacklist: ${type}`);
  return true;
}

/**
 * Blacklist all tokens for a user (emergency logout)
 * @param {number} userId - User ID
 * @param {string} tenantId - Tenant ID
 * @param {string} reason - Reason for blacklisting
 */
async function blacklistAllUserTokens(userId, tenantId, reason = 'security_incident') {
  // This would require tracking active tokens per user
  // For now, we'll add a user-specific blacklist entry
  const key = `${BLACKLIST_PREFIX}user:${tenantId}:${userId}`;
  const metadata = {
    blacklistedAt: new Date().toISOString(),
    reason,
    allTokens: true
  };
  
  await cacheService.set(key, metadata, REFRESH_TOKEN_TTL);
  console.log(`[TokenBlacklist] All tokens blacklisted for user ${userId} in tenant ${tenantId}`);
  return true;
}

/**
 * Check if all tokens for a user are blacklisted
 * @param {number} userId - User ID
 * @param {string} tenantId - Tenant ID
 */
async function areAllUserTokensBlacklisted(userId, tenantId) {
  const key = `${BLACKLIST_PREFIX}user:${tenantId}:${userId}`;
  const blacklisted = await cacheService.get(key);
  return blacklisted !== null;
}

/**
 * Clean up expired blacklist entries (called by scheduled job)
 */
async function cleanupExpiredEntries() {
  // Redis automatically handles TTL expiration, but we can log stats
  console.log('[TokenBlacklist] Cleanup check completed (handled by Redis TTL)');
}

/**
 * Get blacklist statistics for monitoring
 */
async function getBlacklistStats() {
  // This would require Redis SCAN operation in production
  // For now, return basic info
  return {
    backend: cacheService.analytics().backend,
    message: 'Stats available through Redis monitoring tools'
  };
}

export default {
  blacklistToken,
  isTokenBlacklisted,
  getBlacklistMetadata,
  removeFromBlacklist,
  blacklistAllUserTokens,
  areAllUserTokensBlacklisted,
  cleanupExpiredEntries,
  getBlacklistStats,
  hashToken
};
