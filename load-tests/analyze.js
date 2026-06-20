import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.join(__dirname, 'baselines.json');

function formatNumber(value) {
  return Number(value).toFixed(2);
}

export async function loadBaselines() {
  const raw = await readFile(baselinePath, 'utf8');
  return JSON.parse(raw);
}

export async function analyzeResults(results) {
  const baselines = await loadBaselines();

  const scenarioResults = results.scenarios.map((scenario) => {
    const baseline = baselines[scenario.id];
    const checks = [];

    if (baseline) {
      checks.push({
        label: 'error rate',
        passed: scenario.errorRate <= baseline.maxErrorRate,
        actual: formatNumber(scenario.errorRate),
        expected: `<= ${formatNumber(baseline.maxErrorRate)}`,
      });
      checks.push({
        label: 'tail latency (p97.5)',
        passed: scenario.latency.tail <= baseline.maxTailLatencyMs,
        actual: `${formatNumber(scenario.latency.tail)} ms`,
        expected: `<= ${formatNumber(baseline.maxTailLatencyMs)} ms`,
      });
      checks.push({
        label: 'throughput',
        passed: scenario.requests.average >= baseline.minRequestsPerSecond,
        actual: `${formatNumber(scenario.requests.average)} req/s`,
        expected: `>= ${formatNumber(baseline.minRequestsPerSecond)} req/s`,
      });
    }

    return {
      ...scenario,
      baseline,
      checks,
      passed: checks.every((check) => check.passed),
    };
  });

  const passed = scenarioResults.every((scenario) => scenario.passed);
  const bottlenecks = [];

  for (const scenario of scenarioResults) {
    if (scenario.errorRate > 0) {
      bottlenecks.push(
        `${scenario.id}: observed ${formatNumber(scenario.errorRate)}% errors under load`,
      );
    }
    if (scenario.latency.tail > 100) {
      bottlenecks.push(
        `${scenario.id}: tail latency reached ${formatNumber(scenario.latency.tail)} ms`,
      );
    }
    if (scenario.requests.average < 250) {
      bottlenecks.push(
        `${scenario.id}: throughput dropped to ${formatNumber(scenario.requests.average)} req/s`,
      );
    }
  }

  return {
    passed,
    scenarioResults,
    bottlenecks,
    summary: passed
      ? 'All load-test scenarios met the current baseline thresholds.'
      : 'One or more load-test scenarios fell below the defined baselines.',
  };
}

export function renderMarkdownReport(analysis) {
  const lines = ['# Load Test Report', '', analysis.summary, ''];

  for (const scenario of analysis.scenarioResults) {
    lines.push(`## ${scenario.title}`);
    lines.push(`- Status: ${scenario.passed ? 'PASS' : 'FAIL'}`);
    lines.push(`- Average throughput: ${formatNumber(scenario.requests.average)} req/s`);
    lines.push(`- Tail latency (p97.5): ${formatNumber(scenario.latency.tail)} ms`);
    lines.push(`- Error rate: ${formatNumber(scenario.errorRate)}%`);
    if (scenario.checks.length > 0) {
      for (const check of scenario.checks) {
        lines.push(
          `- ${check.label}: ${check.actual} (${check.expected}) ${check.passed ? 'PASS' : 'FAIL'}`,
        );
      }
    }
    lines.push('');
  }

  lines.push('## Findings');
  if (analysis.bottlenecks.length === 0) {
    lines.push('- No major bottlenecks were detected in the current baseline run.');
  } else {
    for (const bottleneck of analysis.bottlenecks) {
      lines.push(`- ${bottleneck}`);
    }
  }

  return `${lines.join('\n')}\n`;
}
