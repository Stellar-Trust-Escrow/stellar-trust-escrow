/**
 * Refresh Token Service
 *
 * Implements rotating refresh tokens with token family tracking and
 * reuse detection (RFC-compliant: stolen token invalidates whole family).
 *
 * - Access tokens: 15 minutes
 * - Refresh tokens: 7 days
 * - Reuse of a consumed token → revoke entire family
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';
import tokenBlacklistService from './tokenBlacklistService.js';

const REFRESH_EXPIRY_DAYS = 7;
const ACCESS_EXPIRY = '15m';
const MAX_ACTIVE_TOKENS_PER_USER = 5;

function generateId() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signRefreshJwt(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret', {
    expiresIn: `${REFRESH_EXPIRY_DAYS}d`,
  });
}

function signAccessJwt(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET || 'fallback_access_secret', {
    expiresIn: ACCESS_EXPIRY,
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function cleanupExpiredTokens(userId, tenantId) {
  await prisma.refreshToken.deleteMany({
    where: { userId, tenantId, expiresAt: { lt: new Date() } },
  });
}

/** Revoke every token in a family — used when reuse is detected. */
async function revokeFamilyTokens(familyId) {
  await prisma.refreshToken.updateMany({
    where: { familyId },
    data: { isActive: false, used: true },
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Issue a brand-new refresh token for a user (initial login or new family).
 *
 * @param {object} user  - { id, tenantId }
 * @param {string} [familyId] - omit to start a new family
 * @param {object} [meta] - { deviceInfo, ipAddress, userAgent }
 */
async function createRefreshToken(user, familyId = null, meta = {}) {
  const tokenId = generateId();
  const family = familyId ?? generateId();   // new family if none provided
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRY_DAYS * 86_400_000);

  const refreshToken = signRefreshJwt({
    userId: user.id,
    tenantId: user.tenantId,
    tokenId,
    familyId: family,
    type: 'refresh',
  });

  const tokenHash = hashToken(refreshToken);

  await cleanupExpiredTokens(user.id, user.tenantId);

  // Enforce per-user session cap
  const activeCount = await prisma.refreshToken.count({
    where: { userId: user.id, tenantId: user.tenantId, isActive: true, expiresAt: { gt: new Date() } },
  });
  if (activeCount >= MAX_ACTIVE_TOKENS_PER_USER) {
    const oldest = await prisma.refreshToken.findMany({
      where: { userId: user.id, tenantId: user.tenantId, isActive: true },
      orderBy: { lastUsedAt: 'asc' },
      take: activeCount - MAX_ACTIVE_TOKENS_PER_USER + 1,
      select: { id: true },
    });
    await prisma.refreshToken.updateMany({
      where: { id: { in: oldest.map((t) => t.id) } },
      data: { isActive: false },
    });
  }

  const record = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash,
      familyId: family,
      used: false,
      isActive: true,
      expiresAt,
      deviceInfo: meta.deviceInfo ?? undefined,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    },
  });

  return { refreshToken, recordId: record.id, familyId: family, expiresAt };
}

/**
 * Rotate a refresh token:
 *  1. Verify JWT signature & expiry.
 *  2. Look up the DB record by hash.
 *  3. If the token is already `used` → REUSE DETECTED → revoke entire family.
 *  4. Mark old token as used/inactive, issue a new one in the same family.
 *  5. Issue a new short-lived access token.
 *
 * @param {string} oldRefreshToken
 * @param {object} [meta] - { deviceInfo, ipAddress, userAgent }
 * @returns {{ accessToken, refreshToken, expiresAt }}
 */
async function rotateRefreshToken(oldRefreshToken, meta = {}) {
  // 1. Verify JWT
  let decoded;
  try {
    decoded = jwt.verify(oldRefreshToken, process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret');
  } catch {
    throw Object.assign(new Error('Invalid or expired refresh token'), { statusCode: 401 });
  }

  if (decoded.type !== 'refresh') {
    throw Object.assign(new Error('Invalid token type'), { statusCode: 401 });
  }

  // 2. Find record
  const tokenHash = hashToken(oldRefreshToken);
  const record = await prisma.refreshToken.findFirst({
    where: { tokenHash, userId: decoded.userId, tenantId: decoded.tenantId },
    include: { user: true },
  });

  if (!record) {
    throw Object.assign(new Error('Refresh token not found'), { statusCode: 401 });
  }

  // 3. Reuse detection — token already marked used → compromised family
  if (record.used || !record.isActive) {
    if (decoded.familyId) {
      await revokeFamilyTokens(decoded.familyId);
    }
    throw Object.assign(
      new Error('Refresh token reuse detected. All sessions for this login have been revoked.'),
      { statusCode: 401 },
    );
  }

  if (record.expiresAt < new Date()) {
    await prisma.refreshToken.update({ where: { id: record.id }, data: { isActive: false } });
    throw Object.assign(new Error('Refresh token expired'), { statusCode: 401 });
  }

  // 4. Mark old token consumed
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { used: true, isActive: false, lastUsedAt: new Date(), ipAddress: meta.ipAddress ?? null, userAgent: meta.userAgent ?? null },
  });

  // 5. Issue new token in same family
  const newTokenData = await createRefreshToken(
    { id: record.userId, tenantId: record.tenantId },
    decoded.familyId,
    meta,
  );

  const accessToken = signAccessJwt({
    userId: record.userId,
    tenantId: record.tenantId,
    type: 'access',
  });

  return { accessToken, refreshToken: newTokenData.refreshToken, expiresAt: newTokenData.expiresAt };
}

/**
 * Revoke a single refresh token (logout).
 */
async function revokeRefreshToken(refreshToken, reason = 'logout') {
  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.updateMany({ where: { tokenHash }, data: { isActive: false, used: true } });
  try {
    await tokenBlacklistService.blacklistToken(refreshToken, 'refresh', reason);
  } catch {
    // blacklist is best-effort
  }
  return true;
}

/**
 * Revoke all refresh tokens for a user (security action).
 */
async function revokeAllUserTokens(userId, tenantId, reason = 'security') {
  await prisma.refreshToken.updateMany({
    where: { userId, tenantId, isActive: true },
    data: { isActive: false, used: true },
  });
  try {
    await tokenBlacklistService.blacklistAllUserTokens(userId, tenantId, reason);
  } catch {
    // best-effort
  }
  return true;
}

async function getUserActiveTokens(userId, tenantId) {
  return prisma.refreshToken.findMany({
    where: { userId, tenantId, isActive: true, used: false, expiresAt: { gt: new Date() } },
    select: { id: true, familyId: true, deviceInfo: true, ipAddress: true, userAgent: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    orderBy: { lastUsedAt: 'desc' },
  });
}

export default {
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  getUserActiveTokens,
  cleanupExpiredTokens,
};
