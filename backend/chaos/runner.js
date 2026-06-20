#!/usr/bin/env node
/**
 * Chaos Engineering Runner
 *
 * Executes all (or a named) chaos scenario and writes a JSON report.
 *
 * Usage:
 *   node backend/chaos/runner.js
 *   node backend/chaos/runner.js --scenario db-disconnect
 *   node backend/chaos/runner.js --scenario redis-timeout
 *   node backend/chaos/runner.js --scenario rpc-lag
 *   node backend/chaos/runner.js --scenario duplicate-transaction
 *
 * Environment variables:
 *   CHAOS_TARGET_URL      — API base URL (default: http://localhost:4000)
 *   CHAOS_LOAD_DURATION   — autocannon duration in seconds (default: 10)
 *   CHAOS_CONNECTIONS     — concurrent connections (default: 10)
 *   CHAOS_REPORT_DIR      — directory for JSON reports (default: backend/chaos/reports)
 *
 * @module chaos/runner
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  scenarioDbDisconnect,
  scenarioRedisTimeout,
  scenarioRpcLag,
  scenarioDuplicateTransaction,
} from './scenarios.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = process.env.CHAOS_REPORT_DIR ?? join(__dirname, 'reports');

// ── Parse CLI args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const scenarioFlag = args.indexOf('--scenario');
const targetScenario = scenarioFlag !== -1 ? args[scenarioFlag + 1] : null;

// ── Lazy-load Prisma (only if DB scenario is requested) ───────────────────────

async function getPrisma() {
  const { default: prisma } = await import('../lib/prisma.js');
  return prisma;
}

async function getRedis() {
  // Try to get the redis client from cacheService internals
  // If Redis is not configured, return a no-op stub
  try {
    const { default: cache } = await import('../services/cacheService.js');
    // cacheService doesn't expose the redis client directly — create a fresh one
    const { createClient } = await import('redis');
    const url = process.env.REDIS_URL;
    if (!url) return null;
    const client = createClient({ url });
    await client.connect();
    return client;
  } catch {
    return null;
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

async function run() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   StellarTrust Chaos Engineering     ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`Target: ${process.env.CHAOS_TARGET_URL || 'http://localhost:4000'}`);
  console.log(`Time  : ${new Date().toISOString()}\n`);

  mkdirSync(REPORT_DIR, { recursive: true });

  const results = [];
  const errors = [];

  const runScenario = async (name, fn) => {
    if (targetScenario && targetScenario !== name) return;
    try {
      const result = await fn();
      results.push(result);
      console.log(`  ✓ ${name} — PASSED`);
    } catch (err) {
      errors.push({ scenario: name, error: err.message });
      console.error(`  ✗ ${name} — FAILED: ${err.message}`);
    }
  };

  const prisma = await getPrisma();
  const redis = await getRedis();

  await runScenario('db-disconnect', () => scenarioDbDisconnect(prisma));
  await runScenario('redis-timeout', () =>
    redis
      ? scenarioRedisTimeout(redis)
      : Promise.resolve({ scenario: 'redis-timeout', skipped: 'REDIS_URL not set' }),
  );
  await runScenario('rpc-lag', () => scenarioRpcLag());
  await runScenario('duplicate-transaction', () => scenarioDuplicateTransaction());

  // ── Report ────────────────────────────────────────────────────────────────

  const report = {
    runAt: new Date().toISOString(),
    target: process.env.CHAOS_TARGET_URL || 'http://localhost:4000',
    passed: results.length,
    failed: errors.length,
    results,
    errors,
  };

  const reportPath = join(REPORT_DIR, `chaos-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n──────────────────────────────────────');
  console.log(`Passed : ${results.length}`);
  console.log(`Failed : ${errors.length}`);
  console.log(`Report : ${reportPath}`);
  console.log('──────────────────────────────────────\n');

  if (errors.length > 0) process.exit(1);
}

run().catch((err) => {
  console.error('[Chaos] Runner crashed:', err);
  process.exit(1);
});
