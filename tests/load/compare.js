import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASELINE_PATH = path.join(__dirname, 'baseline.json');
const CURRENT_PATH = path.join(__dirname, 'current.json');

if (!fs.existsSync(CURRENT_PATH)) {
  console.error('❌ current.json not found. Did k6 run successfully?');
  process.exit(1);
}

const current = JSON.parse(fs.readFileSync(CURRENT_PATH, 'utf-8'));

if (!fs.existsSync(BASELINE_PATH)) {
  console.log('📝 baseline.json not found. Creating it from current run...');
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2));
  console.log('✅ Baseline saved.');
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8'));
console.log('🔍 Comparing current run against baseline...');

let failed = false;

for (const [endpoint, p95] of Object.entries(current)) {
  const baseVal = baseline[endpoint];
  if (!baseVal) {
    console.log(`⚠️  No baseline for endpoint ${endpoint}, skipping.`);
    continue;
  }
  
  const diff = p95 - baseVal;
  const pct = (diff / baseVal) * 100;
  
  if (pct > 20) {
    console.error(`❌ REGRESSION: ${endpoint} p95 degraded by ${pct.toFixed(2)}% (${baseVal.toFixed(2)}ms -> ${p95.toFixed(2)}ms)`);
    failed = true;
  } else {
    console.log(`✅ ${endpoint}: ${pct > 0 ? '+' : ''}${pct.toFixed(2)}% (${baseVal.toFixed(2)}ms -> ${p95.toFixed(2)}ms)`);
  }
}

if (failed) {
  console.error('🚨 Load test failed due to regression.');
  process.exit(1);
}

console.log('✅ All endpoints passed regression check.');
