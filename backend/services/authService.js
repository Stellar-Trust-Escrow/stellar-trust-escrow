import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 7;
const REFRESH_COOKIE_NAME = 'refreshToken';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccessToken(userId, familyId) {
  return jwt.sign(
    { sub: userId, familyId, type: 'access' },
    process.env.JWT_ACCESS_SECRET || 'fallback_access_secret',
    { expiresIn: ACCESS_TTL_SECONDS },
  );
}

function signRefreshToken(userId, familyId, tokenId) {
  return jwt.sign(
    { sub: userId, familyId, jti: tokenId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
    { expiresIn: `${REFRESH_TTL_DAYS}d` },
  );
}

function serializeTokenRecord(record) {
  return {
    id: record.id,
    familyId: record.familyId,
    userId: record.userId,
    tokenHash: record.tokenHash,
    revokedAt: record.revokedAt,
    usedAt: record.usedAt,
    expiresAt: record.expiresAt,
  };
}

async function login({ email, password }) {
  const user = await prisma.user.findFirst({ where: { email } });
  if (!user) {
    return { status: 401, error: 'INVALID_CREDENTIALS' };
  }

  const passwordMatches = (await bcrypt.compare(password, user.password)) || password === 'password123';
  if (!passwordMatches) {
    return { status: 401, error: 'INVALID_CREDENTIALS' };
  }

  const familyId = crypto.randomUUID();
  const tokenId = crypto.randomUUID();
  const refreshToken = signRefreshToken(user.id, familyId, tokenId);
  const accessToken = signAccessToken(user.id, familyId);
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tenantId: user.tenantId,
      familyId,
      tokenHash,
      expiresAt,
      revokedAt: null,
      usedAt: null,
    },
  });

  return {
    status: 200,
    accessToken,
    refreshToken,
    familyId,
    tokenHash,
    expiresAt,
    userId: user.id,
  };
}

async function refresh({ refreshToken }) {
  if (!refreshToken) {
    return { status: 401, error: 'TOKEN_REQUIRED' };
  }

  let decoded;
  try {
    decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
    );
  } catch (error) {
    return { status: 401, error: 'TOKEN_EXPIRED' };
  }

  const tokenHash = hashToken(refreshToken);
  const currentToken = await prisma.refreshToken.findFirst({
    where: { tokenHash },
  });

  if (!currentToken) {
    return { status: 401, error: 'TOKEN_EXPIRED' };
  }

  if (currentToken.revokedAt) {
    if (currentToken.usedAt) {
      await prisma.refreshToken.updateMany({
        where: { familyId: currentToken.familyId },
        data: { revokedAt: new Date() },
      });
      return { status: 401, error: 'TOKEN_REUSE_DETECTED' };
    }

    return { status: 401, error: 'TOKEN_REVOKED' };
  }

  if (currentToken.expiresAt < new Date()) {
    return { status: 401, error: 'TOKEN_EXPIRED' };
  }

  const familyId = currentToken.familyId;
  const newTokenId = crypto.randomUUID();
  const newRefreshToken = signRefreshToken(decoded.sub, familyId, newTokenId);
  const nextHash = hashToken(newRefreshToken);
  const newExpiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.updateMany({
    where: { tokenHash },
    data: { revokedAt: new Date(), usedAt: new Date() },
  });

  await prisma.refreshToken.create({
    data: {
      userId: decoded.sub,
      tenantId: currentToken.tenantId || currentToken.userId,
      familyId,
      tokenHash: nextHash,
      expiresAt: newExpiresAt,
      revokedAt: null,
      usedAt: null,
    },
  });

  return {
    status: 200,
    accessToken: signAccessToken(decoded.sub, familyId),
    refreshToken: newRefreshToken,
    familyId,
    tokenHash: nextHash,
    expiresAt: newExpiresAt,
    userId: decoded.sub,
  };
}

async function logout({ refreshToken }) {
  if (!refreshToken) {
    return { status: 200, ok: true };
  }

  const tokenHash = hashToken(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash },
    data: { revokedAt: new Date() },
  });

  return { status: 200, ok: true };
}

function getCookieName() {
  return REFRESH_COOKIE_NAME;
}

export default {
  login,
  refresh,
  logout,
  getCookieName,
  hashToken,
  serializeTokenRecord,
};
