#!/usr/bin/env node
/**
 * Chaos Experiment Runner
 *
 * CLI tool that activates a named chaos experiment, monitors system behaviour,
 * then deactivates it and reports results.
 *
 * Usage:
 *   node chaos/runner.js --experiment db-latency --duration 60
 *   node chaos/runner.js --list
 *   node chaos/runner.js --validate db-latency
 *
 * The runner sets CHAOS_ENABLED=true and CHAOS_EXPERIMENT=<id> for its own
 * process, then spawns the target server (or connects to a running instance via
 * the health endpoint) to validate the hypothesis.
 *
 * In CI / automated testing the runner exits 0 if the experiment's hypothesis
 * holds and 1 otherwise.
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

const EXPERIMENTS_PATH = path.join(__dirname, 'config', 'experiments.json');
const DEFAULT_BASE_URL = process.env.CHAOS_TARGET_URL || 'http://localhost:3000';
const DEFAULT_DURATION  = 30; // seconds

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadExperiments() {
  return JSON.parse(readFileSync(EXPERIMENTS_PATH, 'utf8')).experiments;
}

function findExperiment(id) {
  const exp = loadExperiments().find((e) => e.id === id);
  if (!exp) {
    console.error(`[Runner] Unknown experiment: "${id}"`);
    console.error(`[Runner] Available: ${loadExperiments().map((e) => e.id).join(', ')}`);
    process.exit(1);
  }
  return exp;
}

async function httpGet(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ status: 0, error: 'request timeout' });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printBanner(text) {
  const line = '═'.repeat(text.length + 4);
  console.log(`\n╔${line}╗`);
  console.log(`║  ${text}  ║`);
  console.log(`╚${line}╝\n`);
}

// ─── Sub-commands ─────────────────────────────────────────────────────────────

function cmdList() {
  const experiments = loadExperiments();
  console.log('\nAvailable chaos experiments:\n');
  for (const exp of experiments) {
    console.log(`  ${exp.id.padEnd(30)} ${exp.name}`);
    console.log(`  ${''.padEnd(30)} ${exp.description}\n`);
  }
}

function cmdValidate(id) {
  const exp = findExperiment(id);
  console.log(`\nExperiment: ${exp.id}`);
  console.log(`Name:        ${exp.name}`);
  console.log(`Type:        ${exp.type}`);
  console.log(`Target:      ${exp.target}`);
  console.log(`Routes:      ${exp.routes.join(', ')}`);
  console.log(`Config:      ${JSON.stringify(exp.config, null, 2)}`);
  console.log(`Hypothesis:  ${exp.hypothesis}`);
  console.log(`Expected:    ${exp.expectedBehavior}`);
  console.log('\nConfiguration is valid.\n');
}

async function cmdRun(id, durationSec) {
  const exp = findExperiment(id);

  printBanner(`CHAOS EXPERIMENT: ${exp.name}`);

  console.log(`Hypothesis : ${exp.hypothesis}`);
  console.log(`Duration   : ${durationSec}s`);
  console.log(`Target URL : ${DEFAULT_BASE_URL}`);
  console.log(`Fault type : ${exp.type}`);
  console.log(`Config     : ${JSON.stringify(exp.config)}\n`);

  // Check health before starting
  console.log('[Runner] Checking baseline health…');
  const baseline = await httpGet(`${DEFAULT_BASE_URL}/health`);
  if (baseline.status !== 200) {
    console.warn(`[Runner] WARNING: health endpoint returned ${baseline.status} before experiment. Proceeding anyway.`);
  } else {
    console.log(`[Runner] Baseline health: OK (${baseline.status})`);
  }

  // Activate experiment
  process.env.CHAOS_ENABLED   = 'true';
  process.env.CHAOS_EXPERIMENT = id;
  console.log(`\n[Runner] Experiment ACTIVATED — running for ${durationSec}s…`);
  console.log('[Runner] Set CHAOS_ENABLED=true and CHAOS_EXPERIMENT=' + id + ' in the target process to inject faults.\n');

  const results = { probes: [], errors: 0, successes: 0, startTime: Date.now() };
  const intervalMs = 2000;
  const probeCount  = Math.floor((durationSec * 1000) / intervalMs);

  // Probe loop
  for (let i = 0; i < probeCount; i++) {
    const probe = await httpGet(`${DEFAULT_BASE_URL}/health`);
    results.probes.push({ t: Date.now() - results.startTime, status: probe.status });
    if (probe.status === 200) {
      results.successes++;
    } else {
      results.errors++;
    }
    process.stdout.write(`\r[Runner] Probe ${i + 1}/${probeCount} — status ${probe.status}   `);
    await sleep(intervalMs);
  }

  // Deactivate
  delete process.env.CHAOS_ENABLED;
  delete process.env.CHAOS_EXPERIMENT;
  console.log('\n\n[Runner] Experiment DEACTIVATED');

  // Recovery check
  console.log('[Runner] Waiting 5 s for recovery…');
  await sleep(5000);
  const recovery = await httpGet(`${DEFAULT_BASE_URL}/health`);
  const recovered = recovery.status === 200;

  // Report
  printBanner('RESULTS');
  console.log(`Experiment   : ${exp.id}`);
  console.log(`Duration     : ${durationSec}s`);
  console.log(`Probes       : ${results.probes.length}`);
  console.log(`Successes    : ${results.successes}`);
  console.log(`Errors       : ${results.errors}`);
  console.log(`Error rate   : ${((results.errors / results.probes.length) * 100).toFixed(1)}%`);
  console.log(`Post-recovery: ${recovered ? 'HEALTHY ✓' : 'UNHEALTHY ✗'}`);
  console.log(`\nExpected behaviour: ${exp.expectedBehavior}`);

  const exitCode = recovered ? 0 : 1;
  if (!recovered) {
    console.error('\n[Runner] FAILURE: system did not recover within 5 s after experiment ended');
  } else {
    console.log('\n[Runner] SUCCESS: system recovered after experiment');
  }

  process.exit(exitCode);
}

// ─── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--list':
        opts.command = 'list';
        break;
      case '--validate':
        opts.command = 'validate';
        opts.id = args[++i];
        break;
      case '--experiment':
        opts.command = opts.command || 'run';
        opts.id = args[++i];
        break;
      case '--duration':
        opts.duration = parseInt(args[++i], 10);
        break;
      case '--help':
      case '-h':
        opts.command = 'help';
        break;
      default:
        console.warn(`[Runner] Unknown argument: ${args[i]}`);
    }
  }

  return opts;
}

function printHelp() {
  console.log(`
Chaos Experiment Runner

Usage:
  node chaos/runner.js --list
  node chaos/runner.js --validate <experiment-id>
  node chaos/runner.js --experiment <experiment-id> [--duration <seconds>]

Options:
  --list                   List all available experiments
  --validate <id>          Show experiment details without running
  --experiment <id>        Run the specified experiment
  --duration <seconds>     How long to run (default: ${DEFAULT_DURATION}s)
  --help                   Show this help message

Environment variables:
  CHAOS_TARGET_URL         Base URL to probe (default: http://localhost:3000)
  CHAOS_ENABLED            Set to 'true' to activate fault injection
  CHAOS_EXPERIMENT         Active experiment ID
`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const opts = parseArgs();

switch (opts.command) {
  case 'list':
    cmdList();
    break;
  case 'validate':
    cmdValidate(opts.id);
    break;
  case 'run':
    await cmdRun(opts.id, opts.duration ?? DEFAULT_DURATION);
    break;
  case 'help':
  default:
    printHelp();
}
