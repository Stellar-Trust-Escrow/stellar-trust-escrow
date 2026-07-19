import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

export function handleSummaryWithBaseline(data) {
  // We're returning an object that tells k6 where to send outputs.
  // We can write to stdout, and also write to a baseline.json if needed.
  // However, handleSummary allows us to manipulate the data and write files.
  // Wait, k6 cannot do I/O natively from handleSummary unless it writes to a file in the returned object.
  // But wait, the prompt says "summary.js: write p95 values to tests/load/baseline.json on first run. CI job: compare current run p95 to baseline"
  // Actually, k6's handleSummary can write to files if we map a filename to the contents.
  // Like: return { 'stdout': textSummary(data), 'tests/load/baseline.json': JSON.stringify(customData) }
  // But we need to *read* the baseline in CI to do the comparison. That usually happens outside k6 or we just exit 1 if the current run regresses compared to the baseline.
  // Wait, the prompt says "CI job: compare current run p95 to baseline; if any endpoint regresses > 20% -> exit 1."
  // So the k6 script itself just writes to tests/load/current.json and the CI script does the comparison?
  // Let me reread: "baseline JSON generated on first run; subsequent run detects intentional regression... with exit code 1."
  // It says "summary.js: write p95 values to tests/load/baseline.json on first run. CI job: compare current run p95 to baseline; if any endpoint regresses > 20% → exit 1."
  // So we can have summary.js generate a `current_run.json` or maybe a script does it. Actually, `summary.js` can be a node script that parses `summary.json`, OR it's imported in k6 and just outputs a simplified JSON file.
  
  // Since we're restricted by k6, I will output the p95s to `tests/load/current.json`
  const p95s = {};
  for (const metricName in data.metrics) {
    if (metricName.startsWith('http_req_duration{endpoint:')) {
      const endpoint = metricName.match(/endpoint:([^}]+)/)[1];
      p95s[endpoint] = data.metrics[metricName].values['p(95)'];
    }
  }

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'tests/load/current.json': JSON.stringify(p95s, null, 2),
  };
}
