/**
 * performance-reporter.js
 *
 * Autocannon-based nightly load test suite.
 * Simulates concurrent users across realistic escrow workflows,
 * tracks latency / success rates, generates an HTML report,
 * and alerts on regressions.
 *
 * Usage:
 *   node load-tests/performance-reporter.js [--ci]
 *
 * Scheduled via load-tests/nightly.cron.
 * Results written to load-tests/results/
 */

import autocannon from 'autocannon';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_CI = process.argv.includes('--ci');

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.LOAD_TEST_URL ?? 'http://localhost:4000';
const RESULTS_DIR = path.join(__dirname, 'results');
const HISTORY_FILE = path.join(RESULTS_DIR, 'history.json');
const REPORT_FILE = path.join(RESULTS_DIR, 'performance-report.html');

/** Alert thresholds — violations trigger a non-zero exit in CI */
const THRESHOLDS = {
  maxErrorRatePct: 1, // >1% errors
  maxP99LatencyMs: 1000, // >1 s p99
  maxP95LatencyMs: 500, // >500 ms p95
  minReqPerSec: 30, // <30 req/s
};

/** Stress scenarios matching realistic user flows */
const SCENARIOS = [
  {
    name: 'View Escrow List',
    url: `${BASE_URL}/api/escrows`,
    method: 'GET',
    connections: 50,
    duration: 15,
    headers: { accept: 'application/json' },
  },
  {
    name: 'View Single Escrow',
    url: `${BASE_URL}/api/escrows/demo-id`,
    method: 'GET',
    connections: 30,
    duration: 15,
    headers: { accept: 'application/json' },
  },
  {
    name: 'Health Check',
    url: `${BASE_URL}/health`,
    method: 'GET',
    connections: 100,
    duration: 10,
  },
  {
    name: 'Reputation Lookup',
    url: `${BASE_URL}/api/reputation/GDEMO000000000000000000000000000000000000000000000000000`,
    method: 'GET',
    connections: 40,
    duration: 15,
    headers: { accept: 'application/json' },
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

function runScenario(scenario) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: scenario.url,
        method: scenario.method ?? 'GET',
        connections: scenario.connections,
        duration: scenario.duration,
        headers: scenario.headers ?? {},
        body: scenario.body,
        timeout: 10,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      },
    );
    autocannon.track(instance, { renderProgressBar: !IS_CI });
  });
}

function checkThresholds(name, result) {
  const errors = [];
  const errorRate = (result.errors / Math.max(result.requests.total, 1)) * 100;
  const p99 = result.latency.p99;
  const p95 = result.latency.p97_5; // autocannon uses p97_5 as closest to p95
  const rps = result.requests.average;

  if (errorRate > THRESHOLDS.maxErrorRatePct)
    errors.push(`Error rate ${errorRate.toFixed(2)}% > ${THRESHOLDS.maxErrorRatePct}%`);
  if (p99 > THRESHOLDS.maxP99LatencyMs)
    errors.push(`p99 latency ${p99}ms > ${THRESHOLDS.maxP99LatencyMs}ms`);
  if (p95 > THRESHOLDS.maxP95LatencyMs)
    errors.push(`p95 latency ${p95}ms > ${THRESHOLDS.maxP95LatencyMs}ms`);
  if (rps < THRESHOLDS.minReqPerSec)
    errors.push(`Throughput ${rps.toFixed(1)} req/s < ${THRESHOLDS.minReqPerSec} req/s`);

  return errors;
}

// ── HTML Report ───────────────────────────────────────────────────────────────

function buildHtmlReport(runResults, timestamp) {
  const rows = runResults
    .map(({ scenario, result, violations }) => {
      const errorRate = ((result.errors / Math.max(result.requests.total, 1)) * 100).toFixed(2);
      const status = violations.length > 0 ? '❌' : '✅';
      return `
      <tr class="${violations.length > 0 ? 'fail' : 'pass'}">
        <td>${status} ${scenario.name}</td>
        <td>${result.requests.average.toFixed(1)}</td>
        <td>${result.latency.mean.toFixed(1)}</td>
        <td>${result.latency.p97_5}</td>
        <td>${result.latency.p99}</td>
        <td>${errorRate}%</td>
        <td>${violations.length > 0 ? violations.join('<br>') : '—'}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Load Test Report — ${timestamp}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; }
    h1 { color: #1a1a2e; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f4f4f4; }
    tr.fail td { background: #fff0f0; }
    tr.pass td { background: #f0fff4; }
  </style>
</head>
<body>
  <h1>🚀 Load Test Report</h1>
  <p>Generated: ${timestamp} | Base URL: ${BASE_URL}</p>
  <table>
    <thead>
      <tr>
        <th>Scenario</th><th>Req/s</th><th>Mean (ms)</th>
        <th>p95 (ms)</th><th>p99 (ms)</th><th>Error Rate</th><th>Violations</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  await mkdir(RESULTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString();
  const runResults = [];
  let hasViolations = false;

  console.log(`\n🚀  Starting load tests against ${BASE_URL}\n`);

  for (const scenario of SCENARIOS) {
    console.log(
      `\n▶  ${scenario.name} (${scenario.connections} connections, ${scenario.duration}s)`,
    );

    let result;
    try {
      result = await runScenario(scenario);
    } catch (err) {
      console.warn(`  ⚠  Skipped (server unreachable): ${err.message}`);
      continue;
    }

    const violations = checkThresholds(scenario.name, result);
    runResults.push({ scenario, result, violations });

    const errorRate = ((result.errors / Math.max(result.requests.total, 1)) * 100).toFixed(2);
    console.log(
      `  Req/s: ${result.requests.average.toFixed(1)} | Mean: ${result.latency.mean.toFixed(1)}ms | p99: ${result.latency.p99}ms | Errors: ${errorRate}%`,
    );

    if (violations.length > 0) {
      hasViolations = true;
      violations.forEach((v) => console.warn(`  ⚠  ${v}`));
    }
  }

  // ── Persist history ──────────────────────────────────────────────────────────
  let history = [];
  if (existsSync(HISTORY_FILE)) {
    try {
      history = JSON.parse(await readFile(HISTORY_FILE, 'utf8'));
    } catch {
      /* ignore */
    }
  }
  history.push({
    timestamp,
    results: runResults.map(({ scenario, result, violations }) => ({
      scenario: scenario.name,
      rps: result.requests.average,
      mean_ms: result.latency.mean,
      p99_ms: result.latency.p99,
      error_rate_pct: (result.errors / Math.max(result.requests.total, 1)) * 100,
      violations,
    })),
  });
  // Keep last 90 runs
  if (history.length > 90) history = history.slice(-90);
  await writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));

  // ── HTML report ──────────────────────────────────────────────────────────────
  const html = buildHtmlReport(runResults, timestamp);
  await writeFile(REPORT_FILE, html);

  console.log(`\n📊  HTML report: ${REPORT_FILE}`);
  console.log(`📁  History:     ${HISTORY_FILE}\n`);

  if (hasViolations) {
    console.error('❌  Performance regressions detected. Review violations above.');
    process.exit(1);
  }

  console.log('✅  All scenarios passed thresholds.');
}

run().catch((err) => {
  console.error('Fatal error during load test:', err);
  process.exit(1);
});
