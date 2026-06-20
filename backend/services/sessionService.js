/**
 * Session Service
 *
 * Tracks active JWT sessions in PostgreSQL so tokens can be individually
 * or globally revoked. Falls back to in-memory store when DB is unavailable.
 */

import crypto from 'crypto';
import prisma from '../lib/prisma.js';

const memSessions = new Map();

function nowPlusSeconds(seconds) {
  return new Date(Date.now() + seconds * 1000);
}

function parseExpiresIn(expiresIn) {
  if (typeof expiresIn === 'number') return expiresIn;
  const match = String(expiresIn).match(/^(\d+)([smhd])$/);
  if (!match) return 86400;
  const [, n, unit] = match;
  return parseInt(n) * { s: 1, m: 60, h: 3600, d: 86400 }[unit];
}

export async function createSession({ address, userAgent, ipAddress, expiresIn = '24h' }) {
  const jti = crypto.randomUUID();
  const expiresAt = nowPlusSeconds(parseExpiresIn(expiresIn));
  try {
    await prisma.session.create({
      data: { jti, address, userAgent: userAgent ?? '', ipAddress: ipAddress ?? '', expiresAt },
    });
  } catch {
    memSessions.set(jti, {
      jti,
      address,
      userAgent,
      ipAddress,
      expiresAt,
      revokedAt: null,
      createdAt: new Date(),
    });
  }
  return jti;
}

export async function isSessionValid(jti) {
  try {
    const s = await prisma.session.findUnique({ where: { jti } });
    if (!s || s.revokedAt || s.expiresAt < new Date()) return false;
    return true;
  } catch {
    const s = memSessions.get(jti);
    if (!s || s.revokedAt || s.expiresAt < new Date()) return false;
    return true;
  }
}

export async function listSessions(address) {
  try {
    return prisma.session.findMany({
      where: { address, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { jti: true, userAgent: true, ipAddress: true, createdAt: true, expiresAt: true },
    });
  } catch {
    return [...memSessions.values()].filter(
      (s) => s.address === address && !s.revokedAt && s.expiresAt > new Date(),
    );
  }
}

export async function revokeSession(jti) {
  try {
    await prisma.session.update({ where: { jti }, data: { revokedAt: new Date() } });
  } catch {
    const s = memSessions.get(jti);
    if (s) s.revokedAt = new Date();
  }
}

export async function revokeAllSessions(address) {
  try {
    await prisma.session.updateMany({
      where: { address, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    for (const s of memSessions.values()) {
      if (s.address === address) s.revokedAt = new Date();
    }
  }
}

export default { createSession, isSessionValid, listSessions, revokeSession, revokeAllSessions };
