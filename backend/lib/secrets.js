/**
 * Secrets Manager
 *
 * Unified interface for reading secrets from HashiCorp Vault (production)
 * or environment variables (development / CI).
 *
 * ## Backends
 *
 * | SECRETS_BACKEND | Source                                      |
 * |-----------------|---------------------------------------------|
 * | vault           | HashiCorp Vault via KV v2 API               |
 * | env (default)   | process.env — plain env vars / dotenv file  |
 *
 * ## Vault setup (quick-start)
 *
 *   vault secrets enable -path=stellar-trust kv-v2
 *   vault kv put stellar-trust/app \
 *     DATABASE_URL="postgresql://..." \
 *     JWT_SECRET="..." \
 *     ADMIN_API_KEY="..." \
 *     SENDGRID_API_KEY="..." \
 *     EMAIL_UNSUBSCRIBE_SECRET="..." \
 *     SENTRY_DSN="..."
 *
 * ## Environment variables
 *
 *   SECRETS_BACKEND          vault | env (default: env)
 *   VAULT_ADDR               Vault server URL (default: http://127.0.0.1:8200)
 *   VAULT_TOKEN              Static token (dev / CI)
 *   VAULT_ROLE_ID            AppRole role_id  (production)
 *   VAULT_SECRET_ID          AppRole secret_id (production)
 *   VAULT_KV_PATH            KV path for app secrets (default: stellar-trust/app)
 *   VAULT_NAMESPACE          Vault Enterprise namespace (optional)
 *   SECRETS_CACHE_TTL_MS     How long to cache secrets in-process (default: 300000)
 *   SECRETS_ROTATION_INTERVAL_MS  How often to refresh secrets (default: 3600000)
 *
 * @module secrets
 */

import crypto from 'crypto';

// ── Config ────────────────────────────────────────────────────────────────────

const BACKEND = process.env.SECRETS_BACKEND || 'env';
const VAULT_ADDR = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
const VAULT_KV_PATH = process.env.VAULT_KV_PATH || 'stellar-trust/app';
const VAULT_NAMESPACE = process.env.VAULT_NAMESPACE || '';
const CACHE_TTL_MS = parseInt(process.env.SECRETS_CACHE_TTL_MS || '300000', 10);
const ROTATION_INTERVAL_MS = parseInt(
  process.env.SECRETS_ROTATION_INTERVAL_MS || '3600000',
  10,
);

// ── In-process encrypted cache ────────────────────────────────────────────────
// Secrets are AES-256-GCM encrypted in memory so they aren't sitting as
// plaintext strings in the heap. The ephemeral key is generated at startup.

const CACHE_KEY = crypto.randomBytes(32);
const CACHE_IV_LEN = 12;

function encryptForCache(plaintext) {
  const iv = crypto.randomBytes(CACHE_IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', CACHE_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptFromCache(ciphertext) {
  const buf = Buffer.from(ciphertext, 'base64');
  const iv = buf.subarray(0, CACHE_IV_LEN);
  const tag = buf.subarray(CACHE_IV_LEN, CACHE_IV_LEN + 16);
  const encrypted = buf.subarray(CACHE_IV_LEN + 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', CACHE_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/** @type {{ data: string; expiresAt: number } | null} */
let cache = null;

function cacheGet() {
  if (!cache || Date.now() > cache.expiresAt) return null;
  try {
    return JSON.parse(decryptFromCache(cache.data));
  } catch {
    return null;
  }
}

function cacheSet(secrets) {
  cache = {
    data: encryptForCache(JSON.stringify(secrets)),
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

// ── Audit log ─────────────────────────────────────────────────────────────────

const auditLog = [];

/**
 * Appends an entry to the in-process audit log.
 * In production wire this to your structured logger / SIEM.
 *
 * @param {'read'|'rotate'|'error'|'init'} action
 * @param {string} detail
 */
function audit(action, detail) {
  const entry = {
    ts: new Date().toISOString(),
    action,
    detail,
    pid: process.pid,
  };
  auditLog.push(entry);
  // Keep last 1000 entries in memory
  if (auditLog.length > 1000) auditLog.shift();
  console.log(`[Secrets] ${entry.ts} action=${action} ${detail}`);
}

/** Returns a copy of the audit log (for the /health or admin endpoint). */
export function getAuditLog() {
  return [...auditLog];
}

// ── Vault client ──────────────────────────────────────────────────────────────

let vaultToken = process.env.VAULT_TOKEN || '';

/**
 * Authenticates with Vault using AppRole and returns a client token.
 * Falls back to VAULT_TOKEN if role credentials are not set.
 */
async function vaultLogin() {
  const roleId = process.env.VAULT_ROLE_ID;
  const secretId = process.env.VAULT_SECRET_ID;

  if (!roleId || !secretId) {
    // Static token mode (dev / CI)
    if (!vaultToken) throw new Error('VAULT_TOKEN or VAULT_ROLE_ID+VAULT_SECRET_ID required');
    return;
  }

  const headers = { 'Content-Type': 'application/json' };
  if (VAULT_NAMESPACE) headers['X-Vault-Namespace'] = VAULT_NAMESPACE;

  const res = await fetch(`${VAULT_ADDR}/v1/auth/approle/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vault AppRole login failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  vaultToken = json.auth.client_token;
  audit('init', `AppRole login succeeded lease_duration=${json.auth.lease_duration}s`);
}

/**
 * Reads all secrets from Vault KV v2 at VAULT_KV_PATH.
 * @returns {Promise<Record<string, string>>}
 */
async function fetchFromVault() {
  if (!vaultToken) await vaultLogin();

  const headers = {
    'X-Vault-Token': vaultToken,
    'Content-Type': 'application/json',
  };
  if (VAULT_NAMESPACE) headers['X-Vault-Namespace'] = VAULT_NAMESPACE;

  const url = `${VAULT_ADDR}/v1/${VAULT_KV_PATH}`;
  const res = await fetch(url, { headers });

  if (res.status === 403) {
    // Token may have expired — re-authenticate once
    await vaultLogin();
    headers['X-Vault-Token'] = vaultToken;
    const retry = await fetch(url, { headers });
    if (!retry.ok) {
      const text = await retry.text();
      throw new Error(`Vault read failed after re-auth: ${retry.status} ${text}`);
    }
    const json = await retry.json();
    return json.data.data;
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vault read failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json.data.data;
}

// ── Env backend ───────────────────────────────────────────────────────────────

function fetchFromEnv() {
  // Return a snapshot of all process.env values — dotenv has already loaded them
  return { ...process.env };
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Loads all secrets from the configured backend, populates the cache,
 * and merges them into process.env so existing code keeps working
 * without any changes.
 *
 * @returns {Promise<Record<string, string>>}
 */
async function loadSecrets() {
  const cached = cacheGet();
  if (cached) return cached;

  let secrets;
  try {
    if (BACKEND === 'vault') {
      secrets = await fetchFromVault();
      audit('read', `Loaded ${Object.keys(secrets).length} secrets from Vault path=${VAULT_KV_PATH}`);
    } else {
      secrets = fetchFromEnv();
      audit('read', `Loaded ${Object.keys(secrets).length} secrets from env`);
    }
  } catch (err) {
    audit('error', `Failed to load secrets: ${err.message}`);
    throw err;
  }

  cacheSet(secrets);

  // Merge into process.env so all existing code continues to work
  for (const [k, v] of Object.entries(secrets)) {
    if (v !== undefined && v !== null) {
      process.env[k] = String(v);
    }
  }

  return secrets;
}

/**
 * Returns the value of a single secret by name.
 * Loads from cache (or backend if cache is stale).
 *
 * @param {string} name
 * @param {string} [fallback]
 * @returns {Promise<string>}
 */
export async function getSecret(name, fallback) {
  const secrets = await loadSecrets();
  const value = secrets[name] ?? fallback;
  if (value === undefined) {
    audit('error', `Secret not found: ${name}`);
    throw new Error(`Secret "${name}" is not defined`);
  }
  audit('read', `Secret accessed: ${name}`);
  return String(value);
}

/**
 * Returns multiple secrets at once.
 *
 * @param {string[]} names
 * @returns {Promise<Record<string, string>>}
 */
export async function getSecrets(names) {
  const secrets = await loadSecrets();
  const result = {};
  for (const name of names) {
    if (secrets[name] === undefined) {
      audit('error', `Secret not found: ${name}`);
      throw new Error(`Secret "${name}" is not defined`);
    }
    result[name] = String(secrets[name]);
  }
  audit('read', `Batch secrets accessed: ${names.join(', ')}`);
  return result;
}

// ── Rotation ──────────────────────────────────────────────────────────────────

let rotationTimer = null;

/**
 * Forces a cache invalidation and re-fetches all secrets from the backend.
 * Called automatically on the rotation interval; can also be triggered manually.
 */
export async function rotateSecrets() {
  cache = null; // invalidate cache
  try {
    const secrets = await loadSecrets();
    audit('rotate', `Rotated ${Object.keys(secrets).length} secrets`);
    return secrets;
  } catch (err) {
    audit('error', `Rotation failed: ${err.message}`);
    throw err;
  }
}

/**
 * Starts the automatic rotation loop.
 * Call once at application startup after `initSecrets()`.
 */
export function startRotation() {
  if (rotationTimer) return;
  rotationTimer = setInterval(async () => {
    try {
      await rotateSecrets();
    } catch (err) {
      console.error('[Secrets] Auto-rotation failed:', err.message);
    }
  }, ROTATION_INTERVAL_MS);

  // Don't block process exit
  if (rotationTimer.unref) rotationTimer.unref();
  audit('init', `Rotation scheduled every ${ROTATION_INTERVAL_MS / 1000}s`);
}

export function stopRotation() {
  if (rotationTimer) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
}

// ── Initialisation ────────────────────────────────────────────────────────────

/**
 * Initialises the secrets manager.
 * Call this once at the very start of server.js, before any other code
 * that reads process.env for sensitive values.
 *
 * @returns {Promise<void>}
 */
export async function initSecrets() {
  audit('init', `Starting secrets manager backend=${BACKEND}`);
  await loadSecrets();
  startRotation();
}

// ── Access control helpers ────────────────────────────────────────────────────

/**
 * Validates that all required secrets are present.
 * Throws with a clear message listing which ones are missing.
 *
 * @param {string[]} required
 */
export async function assertSecretsPresent(required) {
  const secrets = await loadSecrets();
  const missing = required.filter((k) => !secrets[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required secrets: ${missing.join(', ')}`);
  }
}

export default { initSecrets, getSecret, getSecrets, rotateSecrets, startRotation, stopRotation, assertSecretsPresent, getAuditLog };
