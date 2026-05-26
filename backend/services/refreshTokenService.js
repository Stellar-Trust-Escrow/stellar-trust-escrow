/**
 * Refresh Token Service
 * 
 * Manages refresh token creation, rotation, and validation.
 * Supports multiple concurrent sessions and secure token handling.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import tokenBlacklistService from './tokenBlacklistService.js';

const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const MAX_ACTIVE_TOKENS_PER_USER = 5;

/**
 * Generate a cryptographically secure random token ID
 */
function generateTokenId() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a new refresh token record
 */
async function createRefreshToken(user, deviceInfo = {}, ipAddress = null, userAgent = null) {
  const tokenId = generateTokenId();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  
  // Create JWT with token ID for identification
  const refreshToken = jwt.sign(
    { 
      userId: user.id, 
      tenantId: user.tenantId,
      tokenId,
      type: 'refresh'
    },
    process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
    { expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d` }
  );

  // Hash the token for secure storage
  const tokenHash = tokenBlacklistService.hashToken(refreshToken);

  // Clean up old expired tokens for this user
  await cleanupExpiredTokens(user.id, user.tenantId);

  // Check active token limit
  const activeTokenCount = await prisma.refreshToken.count({
    where: {
      userId: user.id,
      tenantId: user.tenantId,
      isActive: true,
      expiresAt: { gt: new Date() }
    }
  });

  // Deactivate oldest tokens if limit exceeded
  if (activeTokenCount >= MAX_ACTIVE_TOKENS_PER_USER) {
    const oldestTokens = await prisma.refreshToken.findMany({
      where: {
        userId: user.id,
        tenantId: user.tenantId,
        isActive: true,
        expiresAt: { gt: new Date() }
      },
      orderBy: { lastUsedAt: 'asc' },
      take: activeTokenCount - MAX_ACTIVE_TOKENS_PER_USER + 1
    });

    await prisma.refreshToken.updateMany({
      where: {
        id: { in: oldestTokens.map(t => t.id) }
      },
      data: { isActive: false }
    });
  }

  // Create new refresh token record
  const tokenRecord = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash,
      deviceInfo,
      ipAddress,
      userAgent,
      isActive: true,
      expiresAt
    }
  });

  console.log(`[RefreshToken] Created token ${tokenId} for user ${user.id}`);

  return {
    refreshToken,
    tokenId: tokenRecord.id,
    expiresAt: tokenRecord.expiresAt
  };
}

/**
 * Validate and rotate a refresh token
 */
async function rotateRefreshToken(oldRefreshToken, deviceInfo = {}, ipAddress = null, userAgent = null) {
  try {
    // First check if token is blacklisted
    const isBlacklisted = await tokenBlacklistService.isTokenBlacklisted(oldRefreshToken, 'refresh');
    if (isBlacklisted) {
      const metadata = await tokenBlacklistService.getBlacklistMetadata(oldRefreshToken, 'refresh');
      throw new Error(`Token is blacklisted: ${metadata?.reason || 'security issue'}`);
    }

    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(
        oldRefreshToken,
        process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret'
      );
    } catch (_err) {
      throw new Error('Invalid or expired refresh token');
    }

    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }

    // Find token record
    const tokenHash = tokenBlacklistService.hashToken(oldRefreshToken);
    const tokenRecord = await prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        isActive: true,
        expiresAt: { gt: new Date() }
      },
      include: {
        user: true
      }
    });

    if (!tokenRecord) {
      throw new Error('Refresh token not found or expired');
    }

    // Check if all user tokens are blacklisted
    const allTokensBlacklisted = await tokenBlacklistService.areAllUserTokensBlacklisted(
      decoded.userId, 
      decoded.tenantId
    );
    if (allTokensBlacklisted) {
      throw new Error('All user tokens have been revoked');
    }

    // Blacklist the old token
    await tokenBlacklistService.blacklistToken(oldRefreshToken, 'refresh', 'rotation');

    // Deactivate the old token record
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { isActive: false }
    });

    // Update last used timestamp
    await prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { 
        lastUsedAt: new Date(),
        ipAddress,
        userAgent
      }
    });

    // Create new refresh token
    const newTokenData = await createRefreshToken(
      tokenRecord.user,
      deviceInfo,
      ipAddress,
      userAgent
    );

    // Generate new access token
    const accessToken = jwt.sign(
      { 
        userId: tokenRecord.user.id, 
        tenantId: tokenRecord.user.tenantId,
        type: 'access'
      },
      process.env.JWT_ACCESS_SECRET || 'fallback_access_secret',
      { expiresIn: process.env.JWT_ACCESS_EXPIRATION || '15m' }
    );

    console.log(`[RefreshToken] Rotated token for user ${tokenRecord.user.id}`);

    return {
      accessToken,
      refreshToken: newTokenData.refreshToken,
      expiresAt: newTokenData.expiresAt
    };

  } catch (error) {
    console.error('[RefreshToken] Rotation failed:', error.message);
    throw error;
  }
}

/**
 * Revoke a specific refresh token
 */
async function revokeRefreshToken(refreshToken, reason = 'logout') {
  try {
    const tokenHash = tokenBlacklistService.hashToken(refreshToken);
    
    // Blacklist the token
    await tokenBlacklistService.blacklistToken(refreshToken, 'refresh', reason);

    // Deactivate the token record
    await prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { isActive: false }
    });

    console.log(`[RefreshToken] Revoked token: ${reason}`);
    return true;
  } catch (error) {
    console.error('[RefreshToken] Revocation failed:', error.message);
    return false;
  }
}

/**
 * Revoke all refresh tokens for a user
 */
async function revokeAllUserTokens(userId, tenantId, reason = 'security') {
  try {
    // Blacklist all user tokens
    await tokenBlacklistService.blacklistAllUserTokens(userId, tenantId, reason);

    // Deactivate all token records
    await prisma.refreshToken.updateMany({
      where: { 
        userId, 
        tenantId,
        isActive: true 
      },
      data: { isActive: false }
    });

    console.log(`[RefreshToken] Revoked all tokens for user ${userId}: ${reason}`);
    return true;
  } catch (error) {
    console.error('[RefreshToken] Mass revocation failed:', error.message);
    return false;
  }
}

/**
 * Clean up expired tokens
 */
async function cleanupExpiredTokens(userId, tenantId) {
  try {
    const result = await prisma.refreshToken.deleteMany({
      where: {
        userId,
        tenantId,
        expiresAt: { lt: new Date() }
      }
    });

    if (result.count > 0) {
      console.log(`[RefreshToken] Cleaned up ${result.count} expired tokens for user ${userId}`);
    }
  } catch (error) {
    console.error('[RefreshToken] Cleanup failed:', error.message);
  }
}

/**
 * Get active refresh tokens for a user
 */
async function getUserActiveTokens(userId, tenantId) {
  return await prisma.refreshToken.findMany({
    where: {
      userId,
      tenantId,
      isActive: true,
      expiresAt: { gt: new Date() }
    },
    select: {
      id: true,
      deviceInfo: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true
    },
    orderBy: { lastUsedAt: 'desc' }
  });
}

export default {
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  cleanupExpiredTokens,
  getUserActiveTokens,
  generateTokenId
};
