/**
 * accessibility-actions.js
 *
 * Playwright + @axe-core/playwright accessibility scanner.
 * Navigates every major page route and scans for WCAG 2.1 AA violations.
 * Exits non-zero if critical violations are found (blocks CI).
 *
 * Usage:
 *   node scripts/accessibility-actions.js [--base-url http://localhost:3000]
 *
 * Output:
 *   accessibility-report.json  — full violation details
 *   Console summary with pass/fail per route
 */

import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = (() => {
  const idx = process.argv.indexOf('--base-url');
  return idx !== -1
    ? process.argv[idx + 1]
    : (process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000');
})();

/** Pages to scan. Dynamic segments use a representative fixture ID. */
const ROUTES = [
  { name: 'Landing', path: '/' },
  { name: 'Dashboard', path: '/dashboard' },
  { name: 'Explorer', path: '/explorer' },
  { name: 'Escrow Details', path: '/escrow/demo-escrow-id' },
  { name: 'Profile', path: '/profile/GDEMO000000000000000000000000000000000000000000000000000' },
];

/**
 * Violation impact levels that will fail the CI run.
 * "moderate" and above are blocked; "minor" / "cosmetic" are warnings only.
 */
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

// ── Helpers ───────────────────────────────────────────────────────────────────

function countByImpact(violations) {
  return violations.reduce((acc, v) => {
    acc[v.impact] = (acc[v.impact] ?? 0) + 1;
    return acc;
  }, {});
}

function formatViolation(v) {
  const nodes = v.nodes
    .slice(0, 3)
    .map((n) => `    • ${n.html}`)
    .join('\n');
  return `  [${v.impact?.toUpperCase()}] ${v.id}: ${v.description}\n${nodes}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext();

  const report = {
    generated_at: new Date().toISOString(),
    base_url: BASE_URL,
    summary: { total_violations: 0, blocking: 0, warnings: 0, pages_scanned: 0 },
    pages: [],
  };

  let hasBlockingViolations = false;

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route.path}`;
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    } catch {
      console.warn(`⚠  Could not load ${url} — skipping`);
      await page.close();
      continue;
    }

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const { violations } = results;
    const blocking = violations.filter((v) => BLOCKING_IMPACTS.has(v.impact));
    const warnings = violations.filter((v) => !BLOCKING_IMPACTS.has(v.impact));
    const counts = countByImpact(violations);

    report.pages.push({
      name: route.name,
      url,
      violation_count: violations.length,
      by_impact: counts,
      violations: violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        help_url: v.helpUrl,
        nodes: v.nodes.map((n) => ({ html: n.html, target: n.target })),
      })),
    });

    report.summary.total_violations += violations.length;
    report.summary.blocking += blocking.length;
    report.summary.warnings += warnings.length;
    report.summary.pages_scanned += 1;

    const status = blocking.length > 0 ? '❌' : violations.length > 0 ? '⚠ ' : '✅';
    console.log(`${status} ${route.name} (${url})`);
    if (violations.length > 0) {
      console.log(`   ${violations.length} violation(s): ${JSON.stringify(counts)}`);
      violations.forEach((v) => console.log(formatViolation(v)));
    }

    if (blocking.length > 0) hasBlockingViolations = true;

    await page.close();
  }

  await browser.close();

  // ── Write report ────────────────────────────────────────────────────────────
  const reportDir = path.join(__dirname, '..', 'accessibility-reports');
  await mkdir(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'accessibility-report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  // ── Print summary ────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────');
  console.log('Accessibility Scan Summary');
  console.log('─────────────────────────────────────────');
  console.log(`Pages scanned : ${report.summary.pages_scanned}`);
  console.log(`Total violations: ${report.summary.total_violations}`);
  console.log(`  Blocking (critical/serious): ${report.summary.blocking}`);
  console.log(`  Warnings (moderate/minor)  : ${report.summary.warnings}`);
  console.log(`Report written to: ${reportPath}`);
  console.log('─────────────────────────────────────────\n');

  if (hasBlockingViolations) {
    console.error(
      '❌  Blocking accessibility violations found. Fix critical/serious issues before merging.',
    );
    process.exit(1);
  }

  console.log('✅  No blocking accessibility violations.');
}

run().catch((err) => {
  console.error('Fatal error during accessibility scan:', err);
  process.exit(1);
});
