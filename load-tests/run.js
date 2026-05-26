/* global console, process */
import autocannon from 'autocannon';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { analyzeResults, renderMarkdownReport } from './analyze.js';
import { scenarios } from './config/scenarios.js';
import { generateLoadTestData } from './data/generate.js';
import { startLoadTestServer } from './server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(__dirname, 'results');
const resultJsonPath = path.join(resultsDir, 'latest.json');
const resultMdPath = path.join(resultsDir, 'latest.md');
const datasetPath = path.join(__dirname, 'data', 'generated.json');

function parseArgs(argv) {
  return {
    ci: argv.includes('--ci'),
    targetUrl:
      process.env.LOAD_TEST_TARGET_URL ||
      (() => {
        const index = argv.indexOf('--target');
        return index >= 0 ? argv[index + 1] : '';
      })(),
  };
}

function pickValue(sequence, index) {
  return sequence[index % sequence.length];
}

function buildVariables(dataset, offset = 0) {
  return {
    escrowId: pickValue(dataset.escrows, offset).id,
    userAddress: pickValue(dataset.users, offset * 3).address,
  };
}

function runAutocannonScenario(scenario, url, dataset) {
  const variables = buildVariables(dataset, scenario.connections + scenario.duration);
  const requests = scenario.requests
    ? scenario.requests.map((request) => ({
        ...request,
        headers: scenario.headers,
        path: request.path
          .replaceAll('{{ escrowId }}', String(variables.escrowId))
          .replaceAll('{{ userAddress }}', variables.userAddress),
      }))
    : undefined;
  const targetUrl = scenario.path
    ? `${url}${scenario.path
        .replaceAll('{{ escrowId }}', String(variables.escrowId))
        .replaceAll('{{ userAddress }}', variables.userAddress)}`
    : url;

  return new Promise((resolve, reject) => {
    const instance = autocannon({
      url: targetUrl,
      method: scenario.method,
      headers: scenario.headers,
      connections: scenario.connections,
      duration: scenario.duration,
      workers: 1,
      overallRate: scenario.overallRate,
      requests,
    });

    instance.on('done', (result) => resolve(result));
    instance.on('error', reject);
  });
}

function mapScenarioResult(scenario, result) {
  const errors = result.errors + result.timeouts + result.non2xx;
  const totalRequests = result.requests.total || 1;

  return {
    id: scenario.id,
    title: scenario.title,
    connections: scenario.connections,
    duration: scenario.duration,
    requests: {
      total: result.requests.total,
      average: result.requests.average,
      sent: result.requests.sent,
    },
    throughput: {
      averageBytesPerSecond: result.throughput.average,
    },
    latency: {
      average: result.latency.average,
      tail: result.latency.p97_5,
      p99: result.latency.p99,
      max: result.latency.max,
    },
    errorRate: (errors / totalRequests) * 100,
    errors: {
      errors: result.errors,
      timeouts: result.timeouts,
      non2xx: result.non2xx,
    },
  };
}

async function ensureDataset() {
  const raw = await readFile(datasetPath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await generateLoadTestData();
  const dataset = await ensureDataset();
  let ownedServer = null;

  try {
    if (!args.targetUrl) {
      ownedServer = await startLoadTestServer();
    }

    const url = args.targetUrl || ownedServer.url;
    const scenarioResults = [];

    for (const scenario of scenarios) {
      console.log(`[load-tests] Running ${scenario.id} against ${url}`);
      const result = await runAutocannonScenario(scenario, url, dataset);
      scenarioResults.push(mapScenarioResult(scenario, result));
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      targetUrl: url,
      ci: args.ci,
      scenarios: scenarioResults,
    };

    const analysis = await analyzeResults(payload);
    const markdown = renderMarkdownReport(analysis);

    await mkdir(resultsDir, { recursive: true });
    await writeFile(resultJsonPath, JSON.stringify({ ...payload, analysis }, null, 2));
    await writeFile(resultMdPath, markdown);

    console.log(markdown);

    if (!analysis.passed && args.ci) {
      process.exitCode = 1;
    }
  } finally {
    if (ownedServer) {
      await ownedServer.close();
    }
  }
}

main().catch((error) => {
  console.error('[load-tests] Failed to execute load test suite:', error);
  process.exitCode = 1;
});
