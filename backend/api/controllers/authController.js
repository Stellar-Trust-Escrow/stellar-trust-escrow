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
