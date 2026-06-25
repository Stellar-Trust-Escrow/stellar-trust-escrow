#!/usr/bin/env node
/**
 * Pre-deployment preflight checker.
 *
 * Validates that the runtime environment meets all hard requirements before
 * the application process starts. Exits with code 1 if any check fails so
 * that container orchestrators and CI pipelines see a clear failure signal.
 *
 * Usage:
 *   node scripts/preflight.js
 *
 * Add to package.json:
 *   "predeploy": "node scripts/preflight.js"
 */

import 'dotenv/config';
import { execSync } from 'node:child_process';

const REQUIRED_NODE_MAJOR = 18;

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_ACCESS_SECRET',
  'STELLAR_NETWORK',
  'SOROBAN_RPC_URL',
];

const DANGEROUS_DEFAULTS = {
  JWT_SECRET: ['secret', 'changeme', 'development', 'test'],
  JWT_ACCESS_SECRET: ['secret', 'changeme', 'development', 'test'],
};

let passed = true;

function fail(message) {
  console.error(`  ❌  ${message}`);
  passed = false;
}

function ok(message) {
  console.log(`  ✅  ${message}`);
}

// ── Node version ──────────────────────────────────────────────────────────────

console.log('\n🔍  Checking Node.js version…');
const [major] = process.versions.node.split('.').map(Number);
if (major < REQUIRED_NODE_MAJOR) {
  fail(`Node.js ${REQUIRED_NODE_MAJOR}+ required, found ${process.versions.node}`);
} else {
  ok(`Node.js ${process.versions.node}`);
}

// ── Required environment variables ───────────────────────────────────────────

console.log('\n🔍  Checking required environment variables…');
for (const key of REQUIRED_ENV_VARS) {
  const val = process.env[key];
  if (!val || !val.trim()) {
    fail(`${key} is not set`);
  } else if (DANGEROUS_DEFAULTS[key]?.includes(val.toLowerCase())) {
    fail(`${key} is set to a dangerous default value — use a strong random secret`);
  } else {
    ok(`${key} is set`);
  }
}

// ── DATABASE_URL format ───────────────────────────────────────────────────────

console.log('\n🔍  Checking DATABASE_URL format…');
const dbUrl = process.env.DATABASE_URL ?? '';
if (dbUrl && !dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
  fail(`DATABASE_URL must be a postgresql:// or postgres:// connection string`);
} else if (dbUrl) {
  ok('DATABASE_URL format is valid');
}

// ── Git state (warn on dirty tree in production) ──────────────────────────────

if (process.env.NODE_ENV === 'production') {
  console.log('\n🔍  Checking git working tree…');
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    if (status) {
      fail('Working tree has uncommitted changes — deploying dirty code to production');
    } else {
      ok('Working tree is clean');
    }
  } catch {
    ok('git not available — skipping dirty-tree check');
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
if (!passed) {
  console.error('💥  Preflight failed — fix the issues above before deploying.\n');
  process.exit(1);
}
console.log('🚀  All preflight checks passed.\n');
