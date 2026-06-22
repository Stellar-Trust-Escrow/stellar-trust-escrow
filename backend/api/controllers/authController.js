/**
 * Auth Controller — Wallet Signature Verification
 *
 * Implements challenge-response authentication for Stellar wallet addresses and
 * issues short-lived JWTs with optional server-side session tracking.
 */

import crypto, { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { Keypair, StrKey } from '@stellar/stellar-sdk';
import sessionService from '../../services/sessionService.js';
import { JWT_SECRET, JWT_ALGORITHM } from '../../config/secrets.js';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const NONCE_TTL_MS = 5 * 60 * 1000;

const nonceStore = new Map();

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

function verifySignature(address, message, signature) {
  try {
    return Keypair.fromPublicKey(address).verify(
      Buffer.from(message, 'utf8'),
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return false;
  }
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? '';
}

async function createSessionJti(address, req) {
  if (typeof sessionService?.createSession !== 'function') {
    return randomUUID();
  }

  return sessionService.createSession({
    address,
    userAgent: req.headers['user-agent'],
    ipAddress: getClientIp(req),
    expiresIn: JWT_EXPIRES_IN,
  });
}

export const getNonce = (req, res) => {
  const { address } = req.body;

  if (!address || !isValidStellarAddress(address)) {
    return res.status(400).json({ error: 'Valid Stellar address required' });
  }

  const nonce = generateNonce();
  const message = buildChallengeMessage(address, nonce);
  const expiresAt = Date.now() + NONCE_TTL_MS;

  nonceStore.set(address, { nonce, message, expiresAt });
  setTimeout(() => nonceStore.delete(address), NONCE_TTL_MS);

  return res.json({ address, nonce, message, expiresIn: NONCE_TTL_MS / 1000 });
};

export const verifySignatureAndLogin = async (req, res) => {
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
  nonceStore.delete(address);

  if (!valid) {
    return res.status(401).json({ error: 'Signature verification failed' });
  }

  const jti = await createSessionJti(address, req);
  const token = jwt.sign({ address, jti, iat: Math.floor(Date.now() / 1000) }, JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRES_IN,
  });

  return res.json({ token, address, expiresIn: JWT_EXPIRES_IN });
};

export const refreshToken = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Bearer token required' });
  }

  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    if (payload.jti && typeof sessionService?.revokeSession === 'function') {
      await sessionService.revokeSession(payload.jti);
    }

    const jti = await createSessionJti(payload.address, req);
    const token = jwt.sign({ address: payload.address, jti }, JWT_SECRET, {
      algorithm: JWT_ALGORITHM,
      expiresIn: JWT_EXPIRES_IN,
    });

    return res.json({ token, address: payload.address, expiresIn: JWT_EXPIRES_IN });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

export const logout = async (req, res) => {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
      if (payload.jti && typeof sessionService?.revokeSession === 'function') {
        await sessionService.revokeSession(payload.jti);
      }
    } catch {
      // Logout is idempotent; invalid tokens are treated as already logged out.
    }
  }

  return res.json({ ok: true });
};

export const listSessions = async (req, res) => {
  try {
    const address = req.user?.address ?? req.user?.userId;
    if (!address) return res.status(401).json({ error: 'Authentication required' });

    const sessions =
      typeof sessionService?.listSessions === 'function'
        ? await sessionService.listSessions(address)
        : [];
    return res.json({ data: sessions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const revokeSession = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Session id required' });
    if (typeof sessionService?.revokeSession === 'function') {
      await sessionService.revokeSession(id);
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const revokeAllSessions = async (req, res) => {
  try {
    const address = req.user?.address ?? req.user?.userId;
    if (!address) return res.status(401).json({ error: 'Authentication required' });

    if (typeof sessionService?.revokeAllSessions === 'function') {
      await sessionService.revokeAllSessions(address);
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export default {
  getNonce,
  verifySignatureAndLogin,
  refreshToken,
  logout,
  listSessions,
  revokeSession,
  revokeAllSessions,
};
