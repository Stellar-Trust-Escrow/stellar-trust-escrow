/**
 * Secret material — single source of truth for all JWT signing keys.
 *
 * Reads from `process.env` (which `lib/secrets.js` merges Vault values into when
 * SECRETS_BACKEND=vault). Validation runs at module load: every required secret
 * must be present and the JWT secrets must all be distinct from one another. A
 * missing or duplicated secret throws immediately so the process fails fast at
 * startup instead of silently running with a forgeable, well-known key.
 *
 * Importing this module is the only supported way to obtain a JWT secret —
 * reading `process.env.JWT_SECRET` directly in individual files re-introduces the
 * "default to a known string" footgun this module exists to remove.
 *
 * @module config/secrets
 */

import crypto from 'crypto';

/** Algorithm pinned for every sign()/verify() call — never rely on library defaults. */
export const JWT_ALGORITHM = 'HS256';

const REQUIRED = [
  'JWT_SECRET', // wallet session tokens
  'JWT_ACCESS_SECRET', // short-lived access tokens (WebSocket upgrade, etc.)
  'JWT_REFRESH_SECRET', // refresh tokens
  'MFA_JWT_SECRET', // multi-factor step-up tokens
  'ADMIN_JWT_SECRET', // short-lived admin session tokens
];

// Secrets whose values must never collide. Sharing a key between token types
// lets a token minted for one purpose be replayed for another.
const MUST_BE_DISTINCT = REQUIRED;

const isTest = process.env.NODE_ENV === 'test';
const isVault = (process.env.SECRETS_BACKEND || 'env').toLowerCase() === 'vault';

function loadSecret(name) {
  let value = process.env[name];
  if (value) return value;

  if (isTest) {
    // Tests don't ship real secrets; synthesise a distinct random value so
    // modules load without weakening production (which still throws below).
    value = `test-${name}-${crypto.randomBytes(24).toString('hex')}`;
    process.env[name] = value;
    return value;
  }

  if (isVault) {
    // Vault populates process.env asynchronously via initSecrets() after this
    // module is first imported, so a missing value here is not yet fatal.
    return undefined;
  }

  throw new Error(`${name} env var is required`);
}

const secrets = {};
for (const name of REQUIRED) {
  secrets[name] = loadSecret(name);
}

// Reject duplicate secrets — two equal keys collapse the isolation between
// token types. Skipped for the Vault backend, where values arrive post-init.
if (!isVault || isTest) {
  const seen = new Map();
  for (const name of MUST_BE_DISTINCT) {
    const value = secrets[name];
    if (value === undefined) continue;
    if (seen.has(value)) {
      throw new Error(
        `Secrets ${seen.get(value)} and ${name} must be distinct; they share the same value`,
      );
    }
    seen.set(value, name);
  }
}

export const JWT_SECRET = secrets.JWT_SECRET;
export const JWT_ACCESS_SECRET = secrets.JWT_ACCESS_SECRET;
export const JWT_REFRESH_SECRET = secrets.JWT_REFRESH_SECRET;
export const MFA_JWT_SECRET = secrets.MFA_JWT_SECRET;
export const ADMIN_JWT_SECRET = secrets.ADMIN_JWT_SECRET;

export default {
  JWT_SECRET,
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  MFA_JWT_SECRET,
  ADMIN_JWT_SECRET,
  JWT_ALGORITHM,
};
