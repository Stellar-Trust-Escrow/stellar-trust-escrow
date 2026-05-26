/**
 * Auth Controller — Wallet Signature Verification + Session Management
 *
 *   POST /api/auth/nonce              — generate one-time challenge nonce
 *   POST /api/auth/verify             — verify signature, issue JWT with jti
 *   POST /api/auth/refresh            — refresh valid JWT, rotate session
 *   POST /api/auth/logout             — revoke current session
 *   GET  /api/auth/sessions           — list active sessions
 *   DELETE /api/auth/sessions/:jti    — revoke specific session
 *   DELETE /api/auth/sessions         — revoke all sessions (global logout)
 */

import crypto from 'crypto';
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

function buildChallengeMessage(address, nonce) {
  return `Sign this message to authenticate with StellarTrustEscrow.\n\nAddress: ${address}\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
}

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

  const token = jwt.sign({ address, jti }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return res.json({ token, address, expiresIn: JWT_EXPIRES_IN, sessionId: jti });
};

// ── Refresh ───────────────────────────────────────────────────────────────────

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

// ── Logout ────────────────────────────────────────────────────────────────────

export const logout = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
      if (payload.jti) await sessionService.revokeSession(payload.jti);
    } catch { /* expired — still 200 */ }
  }
  return res.json({ ok: true });
};

// ── Session management ────────────────────────────────────────────────────────

export const listSessions = async (req, res) => {
  try {
    return res.json({ data: await sessionService.listSessions(req.user.address) });
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

export const revokeSession = async (req, res) => {
  try {
    await sessionService.revokeSession(req.params.jti);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

export const revokeAllSessions = async (req, res) => {
  try {
    await sessionService.revokeAllSessions(req.user.address);
    return res.json({ ok: true, message: 'All sessions revoked' });
  } catch (err) { return res.status(500).json({ error: err.message }); }
};

export default { getNonce, verifySignatureAndLogin, refreshToken, logout, listSessions, revokeSession, revokeAllSessions };
