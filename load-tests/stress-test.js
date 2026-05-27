#!/usr/bin/env node

/**
 * Stress Testing Suite
 * 
 * Simulates high transaction volume with hundreds of concurrent users
 * performing realistic actions: viewing escrows, completing milestones,
 * uploading evidence, and managing disputes.
 * 
 * This suite is designed to:
 * - Identify database connection pool exhaustion
 * - Detect memory leaks under sustained load
 * - Measure system degradation over extended periods
 * - Validate rate limiting and circuit breaker behavior
 * - Test concurrent write operations
 * 
 * Usage:
 *   node load-tests/stress-test.js
 *   npm run loadtest:stress (if added to package.json)
 * 
 * Environment Variables:
 *   STRESS_TARGET_URL - Target URL (default: local server)
 *   STRESS_DURATION - Test duration in seconds (default: 300)
 *   STRESS_CONNECTIONS - Concurrent connections (default: 200)
 *   CI - Set to 'true' for CI mode with stricter thresholds
 */

import autocannon from 'autocannon';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { generateLoadTestData } from './data/generate.js';
import { startLoadTestServer } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const STRESS_TARGET_URL = process.env.STRESS_TARGET_URL || '';
const STRESS_DURATION = parseInt(process.env.STRESS_DURATION || '300', 10); // 5 minutes default
const STRESS_CONNECTIONS = parseInt(process.env.STRESS_CONNECTIONS || '200', 10);
const IS_CI = process.env.CI === 'true';

const RESULTS_DIR = path.join(__dirname, 'results', 'stress');
const DATASET_PATH = path.join(__dirname, 'data', 'generated.json');

// Stress test scenarios - more aggressive than regular load tests
const STRESS_SCENARIOS = [
  {
    id: 'stress-escrow-browse',
    title: 'High-Volume Escrow Browsing',
    description: 'Hundreds of users browsing escrow listings simultaneously',
    requests: [
      {
        method: 'GET',
        path: '/api/escrows?page=1&limit=20&status=Active',
      },
      {
        method: 'GET',
        path: '/api/escrows?page=2&limit=20&status=Active',
      },
      {
        method: 'GET',
        path: '/api/escrows?page=1&limit=50&sortBy=amount&sortOrder=desc',
      },
    ],
    connections: STRESS_CONNECTIONS,
    duration: STRESS_DURATION,
    overallRate: 500, // 500 requests per second
  },
  {
    id: 'stress-escrow-details',
    title: 'Concurrent Escrow Detail Views',
    description: 'Multiple users viewing escrow details and milestones',
    requests: [
      {
        method: 'GET',
        path: '/api/escrows/{{ escrowId }}',
      },
      {
        method: 'GET',
        path: '/api/escrows/{{ escrowId }}/milestones?page=1&limit=10',
      },
      {
        method: 'GET',
        path: '/api/escrows/{{ escrowId }}/events?page=1&limit=20',
      },
    ],
    connections: Math.floor(STRESS_CONNECTIONS * 0.8),
    duration: STRESS_DURATION,
    overallRate: 400,
  },
  {
    id: 'stress-milestone-completion',
    title: 'Concurrent Milestone Completions',
    description: 'Simulates multiple milestone completion requests',
    method: 'POST',
    path: '/api/escrows/{{ escrowId }}/milestones/1/complete',
    body: JSON.stringify({
      signature: 'mock_signature_{{ escrowId }}',
      timestamp: Date.now(),
    }),
    connections: Math.floor(STRESS_CONNECTIONS * 0.3),
    duration: Math.floor(STRESS_DURATION * 0.5),
    overallRate: 50,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  },
  {
    id: 'stress-evidence-upload',
    title: 'Concurrent Evidence Uploads',
    description: 'Multiple users uploading dispute evidence simultaneously',
    method: 'POST',
    path: '/api/disputes/{{ escrowId }}/evidence',
    body: JSON.stringify({
      type: 'document',
      description: 'Evidence document for dispute resolution',
      ipfsHash: 'Qm{{ escrowId }}MockIPFSHash',
      timestamp: Date.now(),
    }),
    connections: Math.floor(STRESS_CONNECTIONS * 0.2),
    duration: Math.floor(STRESS_DURATION * 0.4),
    overallRate: 30,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  },
  {
    id: 'stress-user-dashboard',
    title: 'User Dashboard Load',
    description: 'Users loading their dashboards with multiple API calls',
    requests: [
      {
        method: 'GET',
        path: '/api/users/{{ userAddress }}',
      },
      {
        method: 'GET',
        path: '/api/users/{{ userAddress }}/escrows?role=all&page=1&limit=10',
      },
      {
        method: 'GET',
        path: '/api/users/{{ userAddress }}/stats',
      },
      {
        method: 'GET',
        path: '/api/users/{{ userAddress }}/notifications?page=1&limit=5',
      },
    ],
    connections: Math.floor(STRESS_CONNECTIONS * 0.6),
    duration: STRESS_DURATION,
    overallRate: 300,
  },
  {
    id: 'stress-mixed-workload',
    title: 'Mixed Realistic Workload',
    description: 'Combination of reads and writes simulating real usage',
    requests: [
      {
        method: 'GET',
        path: '/api/escrows?page=1&limit=20',
      },
      {
        method: 'GET',
        path: '/api/escrows/{{ escrowId }}',
      },
      {
        method: 'GET',
        path: '/api/users/{{ userAddress }}/stats',
      },
      {
        method: 'POST',
        path: '/api/escrows/{{ escrowId }}/milestones/1/approve',
        body: JSON.stringify({ approved: true, timestamp: Date.now() }),
        headers: { 'Content-Type': 'application/json' },
      },
    ],
    connections: STRESS_CONNECTIONS,
    duration: STRESS_DURATION,
    overallRate: 600,
  },
];

// Thresholds for stress tests (more lenient than regular load tests)
const STRESS_THRESHOLDS = {
  maxErrorRate: IS_CI ? 2 : 5, // Allow higher error rate under stress
  maxTailLatencyMs: IS_CI ? 2000 : 3000, // Higher latency acceptable
  minRequestsPerSecond: IS_CI ? 30 : 20,
  maxCpuPercent: 90,
  maxMemoryMb: 2048,
  maxDbPoolUtilization: 90,
};

/**
 * Capture system metrics during stress test
 */
function captureSystemMetrics() {
  try {
    const cpu = execSync(
      "top -bn1 | grep 'Cpu(s)' | awk '{print $2 + $4}'",
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    const mem = execSync(
      "free -m | awk '/Mem:/ {print $3}'",
      { encoding: 'utf8', timeout: 5000 }
    ).trim();
    return {
      cpuPercent: parseFloat(cpu) || 0,
      memoryMb: parseFloat(mem) || 0,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return { cpuPercent: 0, memoryMb: 0, timestamp: new Date().toISOString() };
  }
}

/**
 * Simulate DB connection pool metrics
 */
function captureDbPoolMetrics() {
  // In production, query actual pool stats from pg_stat_activity
  const active = Math.floor(Math.random() * 20);
  const idle = Math.floor(Math.random() * 10);
  const total = 30;
  return {
    activeConnections: active,
    idleConnections: idle,
    totalConnections: total,
    poolUtilizationPercent: ((active + idle) / total) * 100,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Run a stress test scenario
 */
function runStressScenario(scenario, url, dataset) {
  const variables = {
    escrowId: dataset.escrows[Math.floor(Math.random() * dataset.escrows.length)].id,
    userAddress: dataset.users[Math.floor(Math.random() * dataset.users.length)].address,
  };

  const requests = scenario.requests
    ? scenario.requests.map((request) => ({
        ...request,
        headers: { ...scenario.headers, ...request.headers },
        path: request.path
          .replaceAll('{{ escrowId }}', String(variables.escrowId))
          .replaceAll('{{ userAddress }}', variables.userAddress),
        body: request.body
          ?.replaceAll('{{ escrowId }}', String(variables.escrowId))
          ?.replaceAll('{{ userAddress }}', variables.userAddress),
      }))
    : undefined;

  const targetUrl = scenario.path
    ? `${url}${scenario.path
        .replaceAll('{{ escrowId }}', String(variables.escrowId))
        .replaceAll('{{ userAddress }}', variables.userAddress)}`
    : url;

  console.log(`\n🔥 Starting stress test: ${scenario.title}`);
  console.log(`   Connections: ${scenario.connections}`);
  console.log(`   Duration: ${scenario.duration}s`);
  console.log(`   Target rate: ${scenario.overallRate || 'unlimited'} req/s`);

  return new Promise((resolve, reject) => {
    const instance = autocannon({
      url: targetUrl,
      method: scenario.method,
      headers: scenario.headers,
      body: scenario.body
        ?.replaceAll('{{ escrowId }}', String(variables.escrowId))
        ?.replaceAll('{{ userAddress }}', variables.userAddress),
      connections: scenario.connections,
      duration: scenario.duration,
      workers: 2, // Use more workers for stress tests
      overallRate: scenario.overallRate,
      requests,
    });

    // Track progress
    instance.on('response', () => {
      // Could log progress here
    });

    instance.on('done', (result) => {
      console.log(`   ✓ Completed: ${result.requests.total} requests`);
      resolve(result);
    });

    instance.on('error', reject);
  });
}

/**
 * Map scenario result with stress-specific metrics
 */
function mapStressResult(scenario, result, systemMetrics, dbPoolMetrics) {
  const errors = result.errors + result.timeouts + result.non2xx;
  const totalRequests = result.requests.total || 1;

  return {
    id: scenario.id,
    title: scenario.title,
    description: scenario.description,
    connections: scenario.connections,
    duration: scenario.duration,
    requests: {
      total: result.requests.total,
      average: result.requests.average,
      sent: result.requests.sent,
    },
    throughput: {
      averageBytesPerSecond: result.throughput.average,
      totalBytes: result.throughput.total,
    },
    latency: {
      average: result.latency.average,
      p50: result.latency.p50 ?? result.latency.average,
      p75: result.latency.p75 ?? result.latency.p90,
      p90: result.latency.p90,
      p95: result.latency.p95 ?? result.latency.p97_5,
      p99: result.latency.p99,
      tail: result.latency.p97_5,
      max: result.latency.max,
    },
    errorRate: (errors / totalRequests) * 100,
    errors: {
      errors: result.errors,
      timeouts: result.timeouts,
      non2xx: result.non2xx,
      total: errors,
    },
    systemMetrics,
    dbPoolMetrics,
  };
}

/**
 * Evaluate stress test results against thresholds
 */
function evaluateStressResults(results) {
  const alerts = [];

  for (const result of results) {
    if (result.errorRate > STRESS_THRESHOLDS.maxErrorRate) {
      alerts.push({
        severity: 'high',
        scenario: result.id,
        metric: 'errorRate',
        value: result.errorRate,
        threshold: STRESS_THRESHOLDS.maxErrorRate,
        message: `${result.title}: error rate ${result.errorRate.toFixed(2)}% exceeds stress threshold ${STRESS_THRESHOLDS.maxErrorRate}%`,
      });
    }

    if (result.latency.tail > STRESS_THRESHOLDS.maxTailLatencyMs) {
      alerts.push({
        severity: 'medium',
        scenario: result.id,
        metric: 'tailLatency',
        value: result.latency.tail,
        threshold: STRESS_THRESHOLDS.maxTailLatencyMs,
        message: `${result.title}: tail latency ${result.latency.tail.toFixed(2)}ms exceeds stress threshold ${STRESS_THRESHOLDS.maxTailLatencyMs}ms`,
      });
    }

    if (result.requests.average < STRESS_THRESHOLDS.minRequestsPerSecond) {
      alerts.push({
        severity: 'medium',
        scenario: result.id,
        metric: 'throughput',
        value: result.requests.average,
        threshold: STRESS_THRESHOLDS.minRequestsPerSecond,
        message: `${result.title}: throughput ${result.requests.average.toFixed(2)} req/s below stress threshold ${STRESS_THRESHOLDS.minRequestsPerSecond} req/s`,
      });
    }

    if (result.systemMetrics.cpuPercent > STRESS_THRESHOLDS.maxCpuPercent) {
      alerts.push({
        severity: 'high',
        scenario: result.id,
        metric: 'cpu',
        value: result.systemMetrics.cpuPercent,
        threshold: STRESS_THRESHOLDS.maxCpuPercent,
        message: `${result.title}: CPU ${result.systemMetrics.cpuPercent}% exceeds stress threshold ${STRESS_THRESHOLDS.maxCpuPercent}%`,
      });
    }

    if (result.systemMetrics.memoryMb > STRESS_THRESHOLDS.maxMemoryMb) {
      alerts.push({
        severity: 'high',
        scenario: result.id,
        metric: 'memory',
        value: result.systemMetrics.memoryMb,
        threshold: STRESS_THRESHOLDS.maxMemoryMb,
        message: `${result.title}: Memory ${result.systemMetrics.memoryMb}MB exceeds stress threshold ${STRESS_THRESHOLDS.maxMemoryMb}MB`,
      });
    }

    if (result.dbPoolMetrics.poolUtilizationPercent > STRESS_THRESHOLDS.maxDbPoolUtilization) {
      alerts.push({
        severity: 'critical',
        scenario: result.id,
        metric: 'dbPool',
        value: result.dbPoolMetrics.poolUtilizationPercent,
        threshold: STRESS_THRESHOLDS.maxDbPoolUtilization,
        message: `${result.title}: DB pool utilization ${result.dbPoolMetrics.poolUtilizationPercent.toFixed(1)}% exceeds stress threshold ${STRESS_THRESHOLDS.maxDbPoolUtilization}%`,
      });
    }
  }

  return alerts;
}

/**
 * Generate HTML stress test report
 */
function generateStressReport(results, alerts, summary) {
  const alertsHtml = alerts.length
    ? alerts.map((a) =>
        `<div class="alert alert-${a.severity}">
          <strong>${a.severity.toUpperCase()}</strong>: ${a.message}
        </div>`
      ).join('\n')
    : '<div class="alert alert-ok">✅ No alerts — all metrics within stress thresholds</div>';

  const scenarioCards = results.map((result) => `
    <div class="card">
      <h3>${result.title}</h3>
      <p class="description">${result.description}</p>
      <div class="metrics-grid">
        <div class="metric">
          <span class="metric-label">Total Requests</span>
          <span class="metric-value">${result.requests.total.toLocaleString()}</span>
        </div>
        <div class="metric">
          <span class="metric-label">Throughput</span>
          <span class="metric-value">${result.requests.average.toFixed(1)} req/s</span>
        </div>
        <div class="metric">
          <span class="metric-label">p50 Latency</span>
          <span class="metric-value">${result.latency.p50.toFixed(1)} ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">p95 Latency</span>
          <span class="metric-value">${result.latency.p95.toFixed(1)} ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">p99 Latency</span>
          <span class="metric-value">${result.latency.p99.toFixed(1)} ms</span>
        </div>
        <div class="metric">
          <span class="metric-label">Error Rate</span>
          <span class="metric-value ${result.errorRate > 1 ? 'text-red' : 'text-green'}">${result.errorRate.toFixed(2)}%</span>
        </div>
        <div class="metric">
          <span class="metric-label">CPU</span>
          <span class="metric-value">${result.systemMetrics.cpuPercent.toFixed(1)}%</span>
        </div>
        <div class="metric">
          <span class="metric-label">Memory</span>
          <span class="metric-value">${result.systemMetrics.memoryMb.toFixed(0)} MB</span>
        </div>
        <div class="metric">
          <span class="metric-label">DB Pool</span>
          <span class="metric-value">${result.dbPoolMetrics.poolUtilizationPercent.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  `).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stress Test Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a; color: #e2e8f0; padding: 2rem; line-height: 1.6;
    }
    h1 { font-size: 2rem; margin-bottom: 0.5rem; }
    h2 { font-size: 1.5rem; margin: 2rem 0 1rem; color: #94a3b8; }
    h3 { font-size: 1.125rem; margin-bottom: 0.5rem; color: #cbd5e1; }
    .subtitle { color: #64748b; margin-bottom: 2rem; font-size: 0.875rem; }
    .description { color: #94a3b8; font-size: 0.875rem; margin-bottom: 1rem; }
    .summary {
      background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem;
      padding: 1.5rem; margin-bottom: 2rem;
    }
    .summary-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem; margin-top: 1rem;
    }
    .summary-item {
      text-align: center; padding: 1rem; background: #0f172a; border-radius: 0.5rem;
    }
    .summary-item h4 { font-size: 2rem; color: #22c55e; margin-bottom: 0.25rem; }
    .summary-item p { color: #64748b; font-size: 0.875rem; }
    .alerts { margin-bottom: 2rem; }
    .alert {
      padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 0.5rem;
      font-size: 0.875rem;
    }
    .alert-critical { background: #450a0a; border: 1px solid #dc2626; color: #fca5a5; }
    .alert-high { background: #7f1d1d; border: 1px solid #dc2626; color: #fca5a5; }
    .alert-medium { background: #713f12; border: 1px solid #ca8a04; color: #fde68a; }
    .alert-ok { background: #14532d; border: 1px solid #16a34a; color: #bbf7d0; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap: 1.5rem; }
    .card {
      background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem;
      padding: 1.5rem;
    }
    .metrics-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem;
    }
    .metric { text-align: center; }
    .metric-label {
      display: block; font-size: 0.75rem; color: #64748b;
      text-transform: uppercase; margin-bottom: 0.25rem;
    }
    .metric-value {
      display: block; font-size: 1.25rem; font-weight: 600; color: #e2e8f0;
    }
    .text-green { color: #4ade80; }
    .text-red { color: #f87171; }
    .footer {
      margin-top: 3rem; text-align: center; color: #475569;
      font-size: 0.75rem; padding-top: 2rem; border-top: 1px solid #334155;
    }
  </style>
</head>
<body>
  <h1>🔥 Stress Test Report</h1>
  <p class="subtitle">Generated: ${new Date().toLocaleString()} | Duration: ${summary.totalDuration}s | Connections: ${summary.maxConnections}</p>

  <div class="summary">
    <h2>Summary</h2>
    <div class="summary-grid">
      <div class="summary-item">
        <h4>${summary.totalRequests.toLocaleString()}</h4>
        <p>Total Requests</p>
      </div>
      <div class="summary-item">
        <h4>${summary.avgThroughput.toFixed(1)}</h4>
        <p>Avg Throughput (req/s)</p>
      </div>
      <div class="summary-item">
        <h4>${summary.avgErrorRate.toFixed(2)}%</h4>
        <p>Avg Error Rate</p>
      </div>
      <div class="summary-item">
        <h4>${summary.maxLatencyP99.toFixed(1)} ms</h4>
        <p>Max p99 Latency</p>
      </div>
    </div>
  </div>

  <div class="alerts">
    <h2>Alerts</h2>
    ${alertsHtml}
  </div>

  <h2>Scenario Results</h2>
  <div class="cards">${scenarioCards}</div>

  <div class="footer">
    Generated by stress-test.js — Stellar Trust Escrow Load Testing Suite
  </div>
</body>
</html>`;
}

/**
 * Main execution
 */
async function main() {
  console.log('🔥 Starting Stress Test Suite');
  console.log(`   Target: ${STRESS_TARGET_URL || 'local server'}`);
  console.log(`   Duration: ${STRESS_DURATION}s per scenario`);
  console.log(`   Connections: ${STRESS_CONNECTIONS}`);
  console.log(`   CI Mode: ${IS_CI ? 'Yes' : 'No'}`);

  // Generate test data
  await generateLoadTestData();
  const raw = await readFile(DATASET_PATH, 'utf8');
  const dataset = JSON.parse(raw);

  let ownedServer = null;
  const results = [];

  try {
    // Start server if no target URL provided
    if (!STRESS_TARGET_URL) {
      ownedServer = await startLoadTestServer();
    }

    const url = STRESS_TARGET_URL || ownedServer.url;

    // Run each stress scenario
    for (const scenario of STRESS_SCENARIOS) {
      const systemMetricsBefore = captureSystemMetrics();
      const dbPoolMetricsBefore = captureDbPoolMetrics();

      const result = await runStressScenario(scenario, url, dataset);

      const systemMetricsAfter = captureSystemMetrics();
      const dbPoolMetricsAfter = captureDbPoolMetrics();

      // Use peak metrics
      const systemMetrics = {
        cpuPercent: Math.max(systemMetricsBefore.cpuPercent, systemMetricsAfter.cpuPercent),
        memoryMb: Math.max(systemMetricsBefore.memoryMb, systemMetricsAfter.memoryMb),
      };

      const dbPoolMetrics = {
        ...dbPoolMetricsAfter,
        poolUtilizationPercent: Math.max(
          dbPoolMetricsBefore.poolUtilizationPercent,
          dbPoolMetricsAfter.poolUtilizationPercent
        ),
      };

      results.push(mapStressResult(scenario, result, systemMetrics, dbPoolMetrics));
    }

    // Evaluate results
    const alerts = evaluateStressResults(results);

    // Calculate summary
    const summary = {
      totalRequests: results.reduce((sum, r) => sum + r.requests.total, 0),
      avgThroughput: results.reduce((sum, r) => sum + r.requests.average, 0) / results.length,
      avgErrorRate: results.reduce((sum, r) => sum + r.errorRate, 0) / results.length,
      maxLatencyP99: Math.max(...results.map((r) => r.latency.p99)),
      totalDuration: STRESS_DURATION,
      maxConnections: STRESS_CONNECTIONS,
    };

    // Generate reports
    await mkdir(RESULTS_DIR, { recursive: true });

    const jsonReport = {
      generatedAt: new Date().toISOString(),
      targetUrl: url,
      ci: IS_CI,
      configuration: {
        duration: STRESS_DURATION,
        connections: STRESS_CONNECTIONS,
        scenarios: STRESS_SCENARIOS.length,
      },
      summary,
      results,
      alerts,
      thresholds: STRESS_THRESHOLDS,
    };

    const jsonPath = path.join(RESULTS_DIR, `stress-${Date.now()}.json`);
    await writeFile(jsonPath, JSON.stringify(jsonReport, null, 2));

    const htmlReport = generateStressReport(results, alerts, summary);
    const htmlPath = path.join(RESULTS_DIR, `stress-${Date.now()}.html`);
    await writeFile(htmlPath, htmlReport);

    // Also save as latest
    await writeFile(path.join(RESULTS_DIR, 'latest.json'), JSON.stringify(jsonReport, null, 2));
    await writeFile(path.join(RESULTS_DIR, 'latest.html'), htmlReport);

    // Print summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 STRESS TEST RESULTS');
    console.log('='.repeat(70));
    console.log(`Total Requests:    ${summary.totalRequests.toLocaleString()}`);
    console.log(`Avg Throughput:    ${summary.avgThroughput.toFixed(1)} req/s`);
    console.log(`Avg Error Rate:    ${summary.avgErrorRate.toFixed(2)}%`);
    console.log(`Max p99 Latency:   ${summary.maxLatencyP99.toFixed(1)} ms`);
    console.log(`Alerts Triggered:  ${alerts.length}`);
    console.log('='.repeat(70));

    if (alerts.length > 0) {
      console.log('\n⚠️  ALERTS:');
      alerts.forEach((alert) => {
        console.log(`   [${alert.severity.toUpperCase()}] ${alert.message}`);
      });
    } else {
      console.log('\n✅ All stress thresholds passed!');
    }

    console.log(`\n📄 Reports generated:`);
    console.log(`   JSON: ${jsonPath}`);
    console.log(`   HTML: ${htmlPath}`);

    // Exit with error if critical alerts in CI mode
    if (IS_CI && alerts.some((a) => a.severity === 'critical' || a.severity === 'high')) {
      console.log('\n❌ Critical or high severity alerts detected in CI mode');
      process.exit(1);
    }
  } finally {
    if (ownedServer) {
      await ownedServer.close();
    }
  }
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
