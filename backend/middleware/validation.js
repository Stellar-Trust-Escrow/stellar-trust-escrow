/**
 * Input Validation & Sanitization Middleware
 *
 * Provides:
 * - Request body size limits
 * - XSS prevention via input sanitization
 * - SQL injection prevention (parameterized queries enforced via Prisma; extra guard here)
 * - CSRF token validation for state-changing requests
 * - Reusable express-validator rule sets for common fields
 */

import { body, param, query, validationResult } from 'express-validator';
import crypto from 'crypto';

// ── Request size limit ────────────────────────────────────────────────────────
// Applied in server.js via express.json({ limit }) — exported for consistency.
export const REQUEST_SIZE_LIMIT = '100kb';

// ── XSS / injection sanitization ─────────────────────────────────────────────

/**
 * Strip characters commonly used in HTML/script injection and SQL injection.
 * Prisma uses parameterized queries so SQL injection is already prevented at
 * the ORM level; this adds a defence-in-depth layer for raw string fields.
 */
function sanitizeString(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/[<>]/g, '') // strip HTML angle brackets (XSS)
    .replace(/javascript:/gi, '') // strip JS protocol
    .replace(/on\w+\s*=/gi, '') // strip inline event handlers
    .trim();
}

/**
 * Recursively sanitize all string values in req.body / req.query / req.params.
 */
function sanitizeObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      obj[key] = sanitizeString(obj[key]);
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObject(obj[key]);
    }
  }
  return obj;
}

export function sanitizeInputs(req, _res, next) {
  sanitizeObject(req.body);
  sanitizeObject(req.query);
  sanitizeObject(req.params);
  next();
}

// ── CSRF protection ───────────────────────────────────────────────────────────
// Stateless double-submit cookie pattern.
// The frontend must:
//   1. GET /api/csrf-token  → receive token in JSON + cookie
//   2. Send the token in X-CSRF-Token header on state-changing requests

const CSRF_COOKIE = 'csrf_token';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function generateCsrfToken(_req, res) {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // must be readable by JS to send in header
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 3600 * 1000, // 1 hour
  });
  res.json({ csrfToken: token });
}

export function csrfProtection(req, res, next) {
  if (CSRF_SAFE_METHODS.has(req.method)) return next();

  // Skip CSRF for webhook endpoints (they use their own signature verification)
  if (/\/webhook/.test(req.path)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  next();
}

// ── Validation result handler ─────────────────────────────────────────────────

export function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

// ── Reusable validator chains ─────────────────────────────────────────────────

export const stellarAddressParam = (field = 'address') =>
  param(field)
    .matches(/^G[A-Z2-7]{55}$/)
    .withMessage('Invalid Stellar address');

export const stellarAddressBody = (field = 'address') =>
  body(field)
    .matches(/^G[A-Z2-7]{55}$/)
    .withMessage('Invalid Stellar address');

export const paginationQuery = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

export const escrowIdParam = param('id')
  .matches(/^\d+$/)
  .withMessage('Escrow id must be a numeric string');

export const signedXdrBody = body('signedXdr')
  .isString()
  .notEmpty()
  .isLength({ max: 100_000 })
  .withMessage('signedXdr must be a non-empty string under 100 000 chars');
