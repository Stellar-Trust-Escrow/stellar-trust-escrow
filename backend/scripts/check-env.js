#!/usr/bin/env node
/**
 * check-env.js — pre-deployment secret validation.
 *
 * Verifies that every required secret env var is present, has at least
 * MIN_LENGTH characters of entropy, is not a known placeholder, and that the
 * JWT secrets are all distinct. Exits non-zero on any failure so CI can block a
 * deploy that would otherwise run with a missing, weak, or forgeable key.
 *
 * Usage:  node scripts/check-env.js   (or: npm run check-env)
 */

// Load a local .env if dotenv is available; in CI the secrets are injected
// directly into the environment, so a missing dotenv must not break the check.
try {
  await import('dotenv/config');
} catch {
  // dotenv not installed — rely on the ambient environment.
}

const MIN_LENGTH = 32;

const REQUIRED_SECRETS = [
  'JWT_SECRET',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'MFA_JWT_SECRET',
  'ADMIN_JWT_SECRET',
  'ADMIN_API_KEY',
];

// Secrets that must all differ from one another.
const MUST_BE_DISTINCT = [
  'JWT_SECRET',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'MFA_JWT_SECRET',
  'ADMIN_JWT_SECRET',
];

// Placeholder values shipped in .env.example that must never reach production.
const FORBIDDEN_VALUES = new Set([
  'change_this_in_production',
  'change_this_in_production_access',
  'change_this_in_production_refresh',
  'fallback_access_secret',
  'change_this_to_a_strong_random_secret',
  'change_this_secret',
]);

function main() {
  const failures = [];

  for (const name of REQUIRED_SECRETS) {
    const value = process.env[name];
    if (!value) {
      failures.push(`${name}: missing`);
      continue;
    }
    if (value.length < MIN_LENGTH) {
      failures.push(`${name}: too short (${value.length} < ${MIN_LENGTH} chars)`);
    }
    if (FORBIDDEN_VALUES.has(value)) {
      failures.push(`${name}: uses a known placeholder value — generate a real secret`);
    }
  }

  const seen = new Map();
  for (const name of MUST_BE_DISTINCT) {
    const value = process.env[name];
    if (!value) continue;
    if (seen.has(value)) {
      failures.push(`${name}: duplicates ${seen.get(value)} — secrets must be distinct`);
    } else {
      seen.set(value, name);
    }
  }

  if (failures.length > 0) {
    console.error('✖ Environment secret validation failed:');
    for (const f of failures) console.error(`  - ${f}`);
    console.error(`\n${failures.length} problem(s) found. Refusing to proceed.`);
    process.exit(1);
  }

  console.log(
    `✓ All ${REQUIRED_SECRETS.length} required secrets present, ≥ ${MIN_LENGTH} chars, and distinct.`,
  );
  process.exit(0);
}

main();
