/**
 * Admin Authentication Middleware
 *
 * Two ways to authenticate against `/api/admin/*`:
 *
 *   1. Short-lived admin token (preferred). The admin presents the API key once
 *      to `POST /api/admin/auth/login`, receives a 15-minute HMAC-signed JWT
 *      (ADMIN_JWT_SECRET, HS256) carrying an `adminId` claim, and sends it as
 *      `Authorization: Bearer <token>` on subsequent requests. The `adminId`
 *      gives every privileged action a proper audit trail.
 *
 *   2. Raw API key in the `x-admin-api-key` header. Kept for bootstrap/login and
 *      backward compatibility. Comparisons are constant-time and protected by a
 *      brute-force guard: 5 failed attempts per IP per 15 minutes locks that IP
 *      for 30 minutes and emits an alert log.
 *
 * @module middleware/adminAuth
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ADMIN_JWT_SECRET, JWT_ALGORITHM } from '../../config/secrets.js';
import { createBruteForceGuard } from './slidingRateLimiter.js';
import { createModuleLogger } from '../../config/logger.js';

const log = createModuleLogger('adminAuth');

/** Lifetime of an issued admin session token. */
export const ADMIN_TOKEN_TTL = process.env.ADMIN_TOKEN_TTL || '15m';

const MAX_KEY_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCK_MS = 30 * 60 * 1000; // 30 minutes

const bruteForce = createBruteForceGuard({
  prefix: 'admin-auth',
  maxAttempts: MAX_KEY_ATTEMPTS,
  windowMs: ATTEMPT_WINDOW_MS,
  lockMs: LOCK_MS,
});

function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/** Constant-time string comparison that tolerates length mismatch. */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Derives a stable, non-reversible admin identity from the API key. */
function deriveAdminId(key) {
  return `apikey:${crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 16)}`;
}

/** Mints a short-lived admin session token bound to `adminId`. */
export function issueAdminToken(adminId) {
  return jwt.sign({ type: 'admin', adminId }, ADMIN_JWT_SECRET, {
    algorithm: JWT_ALGORITHM,
    expiresIn: ADMIN_TOKEN_TTL,
  });
}

/** Verifies an admin session token, returning its payload. Throws on failure. */
export function verifyAdminToken(token) {
  const payload = jwt.verify(token, ADMIN_JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
  if (payload.type !== 'admin') throw new Error('Not an admin token');
  return payload;
}

/**
 * Express middleware restricting access to admin-only routes.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const adminAuth = async (req, res, next) => {
  // ── Preferred path: short-lived admin session token ─────────────────────────
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = verifyAdminToken(authHeader.slice(7));
      req.admin = { adminId: payload.adminId };
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired admin token.' });
    }
  }

  // ── Bootstrap / legacy path: raw API key with brute-force protection ─────────
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    // Server misconfiguration — do not expose details
    return res.status(500).json({ error: 'Admin authentication is not configured.' });
  }

  const ip = clientIp(req);

  const lockTtl = await bruteForce.lockTtl(ip);
  if (lockTtl > 0) {
    res.set('Retry-After', String(Math.ceil(lockTtl / 1000)));
    return res
      .status(429)
      .json({ error: 'Too many failed attempts. Try again later.', code: 'ADMIN_AUTH_LOCKED' });
  }

  const providedKey = req.headers['x-admin-api-key'];
  if (!providedKey) {
    return res.status(401).json({ error: 'Admin API key required.' });
  }

  if (!safeEqual(providedKey, adminKey)) {
    const { failures, locked } = await bruteForce.recordFailure(ip);
    if (locked) {
      // Alert log — wire to SIEM / on-call in production.
      log.error({
        msg: 'admin_auth_bruteforce_lock',
        ip,
        failures,
        lockMs: LOCK_MS,
        path: req.originalUrl,
      });
      res.set('Retry-After', String(Math.ceil(LOCK_MS / 1000)));
      return res
        .status(429)
        .json({ error: 'Too many failed attempts. Try again later.', code: 'ADMIN_AUTH_LOCKED' });
    }
    log.warn({ msg: 'admin_auth_invalid_key', ip, failures, path: req.originalUrl });
    return res.status(403).json({ error: 'Invalid admin API key.' });
  }

  req.isAdmin = true;
  req.adminId = 'admin';
  next();
};

export function optionalAdminAuth(req, _res, next) {
  const adminKey = process.env.ADMIN_API_KEY;
  const providedKey = req.headers['x-admin-api-key'];

  if (adminKey && providedKey === adminKey) {
    req.isAdmin = true;
    req.adminId = 'admin';
  }

  next();
}

export default adminAuth;
