#!/usr/bin/env node
/**
 * Bundle size historical tracker and trend reporter.
 *
 * Usage:
 *   node scripts/bundle-report.js [--save] [--trend]
 *
 * --save   Append current build stats to bundle-stats.json
 * --trend  Print trend report comparing last N snapshots
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATS_FILE = path.join(__dirname, '..', 'bundle-stats.json');
const NEXT_DIR = path.join(__dirname, '..', 'frontend', '.next');

const args = process.argv.slice(2);
const shouldSave = args.includes('--save');
const showTrend = args.includes('--trend');

/** Recursively sum sizes of all .js files under a directory */
function sumJsSizes(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return total;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += sumJsSizes(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      total += fs.statSync(full).size;
    }
  }
  return total;
}

/** Collect per-page sizes from the Next.js build output */
function collectPageSizes() {
  const pages = {};

  // Pages router chunks
  const serverDir = path.join(NEXT_DIR, 'server', 'pages');
  if (fs.existsSync(serverDir)) {
    for (const file of fs.readdirSync(serverDir)) {
      if (file.endsWith('.js')) {
        const size = fs.statSync(path.join(serverDir, file)).size;
        pages[`/pages/${file.replace('.js', '')}`] = size;
      }
    }
  }

  // App router chunks
  const appDir = path.join(NEXT_DIR, 'server', 'app');
  if (fs.existsSync(appDir)) {
    const collectApp = (dir, prefix = '') => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectApp(full, `${prefix}/${entry.name}`);
        } else if (entry.name === 'page.js') {
          pages[`/app${prefix}`] = fs.statSync(full).size;
        }
      }
    };
    collectApp(appDir);
  }

  return pages;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDelta(delta) {
  const sign = delta > 0 ? '+' : '';
  return `${sign}${formatBytes(delta)}`;
}

function buildSnapshot() {
  if (!fs.existsSync(NEXT_DIR)) {
    console.error('No .next build directory found. Run `npm run build` first.');
    process.exit(1);
  }

  const staticDir = path.join(NEXT_DIR, 'static');
  const totalStaticJs = sumJsSizes(staticDir);
  const pagesSizes = collectPageSizes();
  const totalPagesJs = Object.values(pagesSizes).reduce((a, b) => a + b, 0);

  return {
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || process.env.GIT_COMMIT || 'local',
    branch: process.env.GITHUB_REF_NAME || process.env.GIT_BRANCH || 'local',
    totalStaticJs,
    totalPagesJs,
    totalJs: totalStaticJs + totalPagesJs,
    pages: pagesSizes,
  };
}

function loadHistory() {
  if (!fs.existsSync(STATS_FILE)) return [];
  return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
}

function saveSnapshot(snapshot) {
  const history = loadHistory();
  history.push(snapshot);
  fs.writeFileSync(STATS_FILE, JSON.stringify(history, null, 2));
  console.log(`Snapshot saved to ${STATS_FILE}`);
}

function printTrendReport(history) {
  if (history.length < 2) {
    console.log('Not enough snapshots for trend analysis (need at least 2).');
    return;
  }

  console.log('\n=== Bundle Size Trend Report ===\n');
  console.log(
    `${'Date'.padEnd(26)} ${'Branch'.padEnd(20)} ${'Total JS'.padEnd(12)} ${'Delta'.padEnd(12)}`,
  );
  console.log('-'.repeat(72));

  for (let i = 0; i < history.length; i++) {
    const snap = history[i];
    const prev = i > 0 ? history[i - 1] : null;
    const delta = prev ? snap.totalJs - prev.totalJs : 0;
    const deltaStr = prev ? formatDelta(delta) : '(baseline)';
    const flag = delta > 50 * 1024 ? ' ⚠️  >50kB growth' : '';
    console.log(
      `${snap.timestamp.slice(0, 19).replace('T', ' ').padEnd(26)} ${(snap.branch || '').padEnd(20)} ${formatBytes(snap.totalJs).padEnd(12)} ${deltaStr}${flag}`,
    );
  }

  const first = history[0];
  const last = history[history.length - 1];
  const totalGrowth = last.totalJs - first.totalJs;
  console.log('\n--- Summary ---');
  console.log(`Snapshots : ${history.length}`);
  console.log(`First     : ${first.timestamp.slice(0, 10)} — ${formatBytes(first.totalJs)}`);
  console.log(`Latest    : ${last.timestamp.slice(0, 10)} — ${formatBytes(last.totalJs)}`);
  console.log(`Net change: ${formatDelta(totalGrowth)}`);
}

function printCurrentSnapshot(snapshot) {
  console.log('\n=== Current Bundle Snapshot ===\n');
  console.log(`Timestamp  : ${snapshot.timestamp}`);
  console.log(`Branch     : ${snapshot.branch}`);
  console.log(`Commit     : ${snapshot.commit}`);
  console.log(`Static JS  : ${formatBytes(snapshot.totalStaticJs)}`);
  console.log(`Pages JS   : ${formatBytes(snapshot.totalPagesJs)}`);
  console.log(`Total JS   : ${formatBytes(snapshot.totalJs)}`);

  const pageEntries = Object.entries(snapshot.pages);
  if (pageEntries.length > 0) {
    console.log('\nPer-page sizes:');
    for (const [page, size] of pageEntries.sort((a, b) => b[1] - a[1])) {
      console.log(`  ${page.padEnd(40)} ${formatBytes(size)}`);
    }
  }
}

// --- Main ---
const snapshot = buildSnapshot();
printCurrentSnapshot(snapshot);

if (shouldSave) {
  saveSnapshot(snapshot);
}

if (showTrend) {
  const history = loadHistory();
  printTrendReport(history);
}

if (!shouldSave && !showTrend) {
  console.log('\nTip: run with --save to record this snapshot, --trend to view history.');
}
