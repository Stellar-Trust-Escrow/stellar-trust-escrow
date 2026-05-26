/**
 * Auth Controller — Wallet Signature Verification
 *
 * Implements a challenge-response authentication flow:
 *   1. POST /api/auth/nonce   — generate a one-time nonce for an address
 *   2. POST /api/auth/verify  — verify the signed nonce, issue JWT
 *   3. POST /api/auth/refresh — refresh an expiring JWT
 *   4. POST /api/auth/logout  — invalidate the session
 *
 * Signature verification uses @stellar/stellar-sdk's Keypair to verify
 * that the provided signature was produced by the private key corresponding
 * to the claimed Stellar public address.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Keypair, StrKey } from '@stellar/stellar-sdk';

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory nonce store — replace with Redis in production
const nonceStore = new Map(); // address → { nonce, expiresAt }

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidStellarAddress(address) {
  try {
    return StrKey.isValidEd25519PublicKey(address);
  } catch {
    return false;
  }
}

function generateNonce() {
  return crypto.randomBytes(32).toString('hex');
}

function buildChallengeMessage(address, nonce) {
  return `Sign this message to authenticate with StellarTrustEscrow.\n\nAddress: ${address}\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
}

/**
 * Verifies a Stellar ed25519 signature.
 * The frontend signs the raw challenge string (not a transaction XDR).
 *
 * @param {string} address   — Stellar G... public key
 * @param {string} message   — the original challenge message
 * @param {string} signature — base64-encoded ed25519 signature
 * @returns {boolean}
 */
function verifySignature(address, message, signature) {
  try {
    const keypair = Keypair.fromPublicKey(address);
    const msgBuffer = Buffer.from(message, 'utf8');
    const sigBuffer = Buffer.from(signature, 'base64');
    return keypair.verify(msgBuffer, sigBuffer);
  } catch {
    return false;
  }
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/auth/nonce
 * Body: { address: string }
 *
 * Generates a one-time nonce for the given Stellar address and returns
 * the challenge message the user must sign.
 */
export const getNonce = (req, res) => {
  const { address } = req.body;

  if (!address || !isValidStellarAddress(address)) {
    return res.status(400).json({ error: 'Valid Stellar address required' });
  }

  const nonce = generateNonce();
  const message = buildChallengeMessage(address, nonce);
  const expiresAt = Date.now() + NONCE_TTL_MS;

  nonceStore.set(address, { nonce, message, expiresAt });

  // Auto-expire from store
  setTimeout(() => nonceStore.delete(address), NONCE_TTL_MS);

  return res.json({
    address,
    nonce,
    message,
    expiresIn: NONCE_TTL_MS / 1000,
  });
};

/**
 * POST /api/auth/verify
 * Body: { address: string, signature: string }
 *
 * Verifies the signature against the stored nonce challenge.
 * Issues a JWT on success and invalidates the nonce.
 */
export const verifySignatureAndLogin = (req, res) => {
  const { address, signature } = req.body;

  if (!address || !isValidStellarAddress(address)) {
    return res.status(400).json({ error: 'Valid Stellar address required' });
  }
  if (!signature || typeof signature !== 'string') {
    return res.status(400).json({ error: 'Signature required' });
  }

  const stored = nonceStore.get(address);
  if (!stored) {
    return res.status(401).json({ error: 'No pending nonce for this address. Request a new one.' });
  }
  if (Date.now() > stored.expiresAt) {
    nonceStore.delete(address);
    return res.status(401).json({ error: 'Nonce expired. Request a new one.' });
  }

  const valid = verifySignature(address, stored.message, signature);

  // Always consume the nonce — prevents replay attacks
  nonceStore.delete(address);

  if (!valid) {
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  const token = jwt.sign(
    { address, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );

  return res.json({
    token,
    address,
    expiresIn: JWT_EXPIRES_IN,
  });
};

/**
 * POST /api/auth/refresh
 * Header: Authorization: Bearer <token>
 *
 * Issues a fresh JWT if the current one is still valid.
 */
export const refreshToken = (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Bearer token required' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const newToken = jwt.sign(
      { address: payload.address },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN },
    );
    return res.json({ token: newToken, address: payload.address, expiresIn: JWT_EXPIRES_IN });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * POST /api/auth/logout
 * Stateless JWT — client discards the token. Returns 200 for UX consistency.
 */
export const logout = (_req, res) => {
  res.json({ ok: true });
};

export default { getNonce, verifySignatureAndLogin, refreshToken, logout };
/* eslint-disable no-unused-vars */
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import sessionService from '../../services/sessionService.js';

const JWT_SECRET    = process.env.JWT_SECRET    || 'change_this_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const NONCE_TTL_MS  = 5 * 60 * 1000;

const nonceStore = new Map();

function isValidStellarAddress(address) {
  try { return StrKey.isValidEd25519PublicKey(address); } catch { return false; }
}

// Helper to generate access token
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      tenantId: user.tenantId,
      type: 'access',
      jti: randomUUID(),
    },
    process.env.JWT_ACCESS_SECRET || 'fallback_access_secret',
    { expiresIn: process.env.JWT_ACCESS_EXPIRATION || '15m' },
  );
};

function verifySignature(address, message, signature) {
  try {
    return Keypair.fromPublicKey(address).verify(
      Buffer.from(message, 'utf8'),
      Buffer.from(signature, 'base64'),
    );
  } catch { return false; }
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '';
}

// ── Nonce ─────────────────────────────────────────────────────────────────────

export const getNonce = (req, res) => {
  const { address } = req.body;
  if (!address || !isValidStellarAddress(address)) {
    return res.status(400).json({ error: 'Valid Stellar address required' });
  }
  const nonce = crypto.randomBytes(32).toString('hex');
  const message = buildChallengeMessage(address, nonce);
  nonceStore.set(address, { message, expiresAt: Date.now() + NONCE_TTL_MS });
  setTimeout(() => nonceStore.delete(address), NONCE_TTL_MS);
  return res.json({ address, nonce, message, expiresIn: NONCE_TTL_MS / 1000 });
};

// ── Verify & Login ────────────────────────────────────────────────────────────

export const verifySignatureAndLogin = async (req, res) => {
  const { address, signature } = req.body;
  if (!address || !isValidStellarAddress(address)) {
    return res.status(400).json({ error: 'Valid Stellar address required' });
  }
  if (!signature) return res.status(400).json({ error: 'Signature required' });

  const stored = nonceStore.get(address);
  if (!stored) return res.status(401).json({ error: 'No pending nonce. Request a new one.' });
  if (Date.now() > stored.expiresAt) {
    nonceStore.delete(address);
    return res.status(401).json({ error: 'Nonce expired. Request a new one.' });
  }

  const valid = verifySignature(address, stored.message, signature);
  nonceStore.delete(address);
  if (!valid) return res.status(401).json({ error: 'Signature verification failed' });

  const jti = await sessionService.createSession({
    address,
    userAgent: req.headers['user-agent'],
    ipAddress: getClientIp(req),
    expiresIn: JWT_EXPIRES_IN,
  });

    // Create refresh token with rotation support
    const deviceInfo = {
      type: 'web',
      trustLevel: 'trusted',
    };

    const refreshTokenData = await refreshTokenService.createRefreshToken(
      user,
      deviceInfo,
      req.ip,
      req.get('User-Agent'),
    );

    // Record metrics
    await tokenMetricsService.recordTokenGeneration(user.id, user.tenantId, 'access', deviceInfo);
    await tokenMetricsService.recordTokenGeneration(user.id, user.tenantId, 'refresh', deviceInfo);

export const refreshToken = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Bearer token required' });
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
    if (payload.jti) await sessionService.revokeSession(payload.jti);
    const jti = await sessionService.createSession({
      address: payload.address,
      userAgent: req.headers['user-agent'],
      ipAddress: getClientIp(req),
      expiresIn: JWT_EXPIRES_IN,
    });
    const token = jwt.sign({ address: payload.address, jti }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return res.json({ token, address: payload.address, expiresIn: JWT_EXPIRES_IN });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const refresh = async (req, res) => {
  const tenantId = req.tenant?.id;

  try {
    const { refreshToken } = req.body;

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant context is required' });
    }

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token is required' });
    }

    // Extract device info from request for rotation tracking
    const deviceInfo = {
      type: 'web',
      trustLevel: 'trusted',
    };

    // Rotate refresh token and get new access token
    const tokens = await refreshTokenService.rotateRefreshToken(
      refreshToken,
      deviceInfo,
      req.ip,
      req.get('User-Agent'),
    );
    const decoded = jwt.decode(tokens.accessToken);

    // Record successful refresh metrics
    await tokenMetricsService.recordTokenRefresh(
      decoded.userId,
      decoded.tenantId,
      true,
      'rotation',
    );
    await tokenMetricsService.recordTokenGeneration(
      decoded.userId,
      decoded.tenantId,
      'access',
      deviceInfo,
    );
    await tokenMetricsService.recordTokenGeneration(
      decoded.userId,
      decoded.tenantId,
      'refresh',
      deviceInfo,
    );

    res.json(tokens);
  } catch (error) {
    console.error('[Refresh] Error:', error.message);

    // Record failed refresh attempt
    if (error.message.includes('blacklisted')) {
      await tokenMetricsService.recordTokenRefresh('unknown', tenantId, false, error.message);
      await tokenMetricsService.recordSuspiciousActivity(
        'unknown',
        tenantId,
        'blacklisted_refresh_token',
        { error: error.message },
      );
      return res.status(403).json({ error: 'Token has been revoked for security reasons' });
    }
    if (error.message.includes('Invalid') || error.message.includes('expired')) {
      await tokenMetricsService.recordTokenRefresh('unknown', tenantId, false, error.message);
      return res.status(403).json({ error: 'Invalid or expired refresh token' });
    }
    if (error.message.includes('revoked')) {
      await tokenMetricsService.recordTokenRefresh('unknown', tenantId, false, error.message);
      await tokenMetricsService.recordSuspiciousActivity(
        'unknown',
        tenantId,
        'revoked_token_attempt',
        { error: error.message },
      );
      return res.status(403).json({ error: 'All tokens have been revoked' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
  return res.json({ ok: true });
};

export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const tenantId = req.tenant?.id;

    if (refreshToken) {
      // Revoke the specific refresh token
      await refreshTokenService.revokeRefreshToken(refreshToken, 'logout');

      // Record revocation metrics
      await tokenMetricsService.recordTokenRevocation('unknown', tenantId, 'logout');
    }

    // If user is authenticated, we could also revoke all their tokens
    // for a complete logout across all devices
    if (req.user && req.body.logoutAll) {
      await refreshTokenService.revokeAllUserTokens(req.user.userId, tenantId, 'logout_all');

      await tokenMetricsService.recordTokenRevocation(req.user.userId, tenantId, 'logout_all');
    }

export const listSessions = async (req, res) => {
  try {
    return res.json({ data: await sessionService.listSessions(req.user.address) });
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

export const revokeSession = async (req, res) => {
  try {
    const tenantId = req.tenant?.id;

    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    await refreshTokenService.revokeAllUserTokens(req.user.userId, tenantId, 'user_request');

    await tokenMetricsService.recordTokenRevocation(req.user.userId, tenantId, 'user_request');

    res.json({ message: 'All tokens revoked successfully' });
  } catch (error) {
    console.error('[RevokeAll] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const revokeAllSessions = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const activeTokens = await refreshTokenService.getUserActiveTokens(
      req.user.userId,
      req.tenant?.id,
    );

    res.json({
      sessions: activeTokens.map((token) => ({
        id: token.id,
        deviceInfo: token.deviceInfo,
        ipAddress: token.ipAddress,
        userAgent: token.userAgent,
        createdAt: token.createdAt,
        lastUsedAt: token.lastUsedAt,
        expiresAt: token.expiresAt,
      })),
    });
  } catch (error) {
    console.error('[Sessions] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export default { getNonce, verifySignatureAndLogin, refreshToken, logout, listSessions, revokeSession, revokeAllSessions };
