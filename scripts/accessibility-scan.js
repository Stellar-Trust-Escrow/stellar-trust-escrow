#!/usr/bin/env node

/**
 * Automated Accessibility Scanner
 * 
 * Scans all major pages of the application for WCAG Level AA violations
 * using Playwright and @axe-core/playwright.
 * 
 * Usage:
 *   node scripts/accessibility-scan.js
 *   npm run test:a11y:scan (if added to package.json)
 * 
 * Environment Variables:
 *   BASE_URL - Base URL of the application (default: http://localhost:3000)
 *   CI - Set to 'true' to enable CI mode with stricter thresholds
 */

import { chromium } from '@playwright/test';
import { injectAxe, checkA11y, getViolations } from 'axe-playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const IS_CI = process.env.CI === 'true';

// Pages to scan
const PAGES_TO_SCAN = [
  { name: 'Landing Page', path: '/' },
  { name: 'Dashboard', path: '/dashboard' },
  { name: 'Explorer', path: '/explorer' },
  { name: 'Create Escrow', path: '/escrow/create' },
  { name: 'Profile', path: '/profile' },
];

// Thresholds for CI failure
const THRESHOLDS = {
  critical: 0,  // No critical violations allowed
  serious: IS_CI ? 0 : 5,  // Stricter in CI
  moderate: IS_CI ? 5 : 10,
  minor: IS_CI ? 10 : 20,
};

// Axe configuration for WCAG Level AA
const AXE_CONFIG = {
  runOnly: {
    type: 'tag',
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  },
};

/**
 * Scan a single page for accessibility violations
 */
async function scanPage(page, pageInfo) {
  console.log(`\n📄 Scanning: ${pageInfo.name} (${pageInfo.path})`);
  
  try {
    // Navigate to page
    await page.goto(`${BASE_URL}${pageInfo.path}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for page to be interactive
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
      console.log('   ⚠️  Network idle timeout - continuing anyway');
    });

    // Inject axe-core
    await injectAxe(page);

    // Run accessibility checks
    const violations = await getViolations(page, null, AXE_CONFIG);

    // Categorize violations by impact
    const categorized = {
      critical: violations.filter(v => v.impact === 'critical'),
      serious: violations.filter(v => v.impact === 'serious'),
      moderate: violations.filter(v => v.impact === 'moderate'),
      minor: violations.filter(v => v.impact === 'minor'),
    };

    // Print summary
    console.log(`   ✓ Scan complete`);
    console.log(`   Critical: ${categorized.critical.length}`);
    console.log(`   Serious:  ${categorized.serious.length}`);
    console.log(`   Moderate: ${categorized.moderate.length}`);
    console.log(`   Minor:    ${categorized.minor.length}`);

    return {
      page: pageInfo.name,
      path: pageInfo.path,
      violations: categorized,
      totalViolations: violations.length,
    };
  } catch (error) {
    console.error(`   ❌ Error scanning ${pageInfo.name}:`, error.message);
    return {
      page: pageInfo.name,
      path: pageInfo.path,
      error: error.message,
      violations: { critical: [], serious: [], moderate: [], minor: [] },
      totalViolations: 0,
    };
  }
}

/**
 * Generate HTML report
 */
function generateHTMLReport(results, outputPath) {
  const totalViolations = results.reduce((sum, r) => sum + r.totalViolations, 0);
  const totalCritical = results.reduce((sum, r) => sum + (r.violations?.critical?.length || 0), 0);
  const totalSerious = results.reduce((sum, r) => sum + (r.violations?.serious?.length || 0), 0);
  const totalModerate = results.reduce((sum, r) => sum + (r.violations?.moderate?.length || 0), 0);
  const totalMinor = results.reduce((sum, r) => sum + (r.violations?.minor?.length || 0), 0);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Accessibility Scan Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 { color: #333; }
    .summary {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-top: 15px;
    }
    .summary-item {
      padding: 15px;
      border-radius: 6px;
      text-align: center;
    }
    .summary-item.critical { background: #fee; border-left: 4px solid #d00; }
    .summary-item.serious { background: #ffeaa7; border-left: 4px solid #f39c12; }
    .summary-item.moderate { background: #fff3cd; border-left: 4px solid #ffc107; }
    .summary-item.minor { background: #e3f2fd; border-left: 4px solid #2196f3; }
    .summary-item h3 { margin: 0; font-size: 32px; }
    .summary-item p { margin: 5px 0 0; color: #666; }
    .page-result {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .page-result h2 { margin-top: 0; color: #333; }
    .violation {
      border-left: 4px solid #ccc;
      padding: 15px;
      margin: 10px 0;
      background: #fafafa;
      border-radius: 4px;
    }
    .violation.critical { border-left-color: #d00; }
    .violation.serious { border-left-color: #f39c12; }
    .violation.moderate { border-left-color: #ffc107; }
    .violation.minor { border-left-color: #2196f3; }
    .violation h4 { margin: 0 0 10px; color: #333; }
    .violation-meta { color: #666; font-size: 14px; margin-bottom: 10px; }
    .violation-nodes { margin-top: 10px; }
    .violation-node {
      background: white;
      padding: 10px;
      margin: 5px 0;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 3px;
      font-size: 12px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .badge.critical { background: #d00; color: white; }
    .badge.serious { background: #f39c12; color: white; }
    .badge.moderate { background: #ffc107; color: #333; }
    .badge.minor { background: #2196f3; color: white; }
    .timestamp { color: #999; font-size: 14px; }
  </style>
</head>
<body>
  <h1>♿ Accessibility Scan Report</h1>
  <p class="timestamp">Generated: ${new Date().toLocaleString()}</p>
  
  <div class="summary">
    <h2>Summary</h2>
    <p>Total violations found: <strong>${totalViolations}</strong> across ${results.length} pages</p>
    <div class="summary-grid">
      <div class="summary-item critical">
        <h3>${totalCritical}</h3>
        <p>Critical</p>
      </div>
      <div class="summary-item serious">
        <h3>${totalSerious}</h3>
        <p>Serious</p>
      </div>
      <div class="summary-item moderate">
        <h3>${totalModerate}</h3>
        <p>Moderate</p>
      </div>
      <div class="summary-item minor">
        <h3>${totalMinor}</h3>
        <p>Minor</p>
      </div>
    </div>
  </div>

  ${results.map(result => `
    <div class="page-result">
      <h2>${result.page}</h2>
      <p><code>${result.path}</code></p>
      
      ${result.error ? `
        <p style="color: #d00;">❌ Error: ${result.error}</p>
      ` : ''}
      
      ${['critical', 'serious', 'moderate', 'minor'].map(impact => {
        const violations = result.violations?.[impact] || [];
        if (violations.length === 0) return '';
        
        return `
          <h3>${impact.charAt(0).toUpperCase() + impact.slice(1)} (${violations.length})</h3>
          ${violations.map(v => `
            <div class="violation ${impact}">
              <h4>
                <span class="badge ${impact}">${impact}</span>
                ${v.help}
              </h4>
              <div class="violation-meta">
                <strong>Rule:</strong> ${v.id} | 
                <strong>WCAG:</strong> ${v.tags.filter(t => t.startsWith('wcag')).join(', ')}
              </div>
              <p>${v.description}</p>
              <div class="violation-nodes">
                <strong>Affected elements (${v.nodes.length}):</strong>
                ${v.nodes.slice(0, 3).map(node => `
                  <div class="violation-node">
                    ${node.html}
                  </div>
                `).join('')}
                ${v.nodes.length > 3 ? `<p><em>... and ${v.nodes.length - 3} more</em></p>` : ''}
              </div>
              ${v.helpUrl ? `<p><a href="${v.helpUrl}" target="_blank">Learn more →</a></p>` : ''}
            </div>
          `).join('')}
        `;
      }).join('')}
      
      ${result.totalViolations === 0 && !result.error ? '<p>✅ No violations found!</p>' : ''}
    </div>
  `).join('')}
</body>
</html>
  `;

  writeFileSync(outputPath, html);
  console.log(`\n📊 HTML report generated: ${outputPath}`);
}

/**
 * Check if results exceed thresholds
 */
function checkThresholds(results) {
  const totals = {
    critical: results.reduce((sum, r) => sum + (r.violations?.critical?.length || 0), 0),
    serious: results.reduce((sum, r) => sum + (r.violations?.serious?.length || 0), 0),
    moderate: results.reduce((sum, r) => sum + (r.violations?.moderate?.length || 0), 0),
    minor: results.reduce((sum, r) => sum + (r.violations?.minor?.length || 0), 0),
  };

  const failures = [];
  
  if (totals.critical > THRESHOLDS.critical) {
    failures.push(`Critical: ${totals.critical} (threshold: ${THRESHOLDS.critical})`);
  }
  if (totals.serious > THRESHOLDS.serious) {
    failures.push(`Serious: ${totals.serious} (threshold: ${THRESHOLDS.serious})`);
  }
  if (totals.moderate > THRESHOLDS.moderate) {
    failures.push(`Moderate: ${totals.moderate} (threshold: ${THRESHOLDS.moderate})`);
  }
  if (totals.minor > THRESHOLDS.minor) {
    failures.push(`Minor: ${totals.minor} (threshold: ${THRESHOLDS.minor})`);
  }

  return { totals, failures };
}

/**
 * Main execution
 */
async function main() {
  console.log('♿ Starting Accessibility Scan');
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   CI Mode: ${IS_CI ? 'Yes' : 'No'}`);
  console.log(`   Pages to scan: ${PAGES_TO_SCAN.length}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];

  // Scan each page
  for (const pageInfo of PAGES_TO_SCAN) {
    const result = await scanPage(page, pageInfo);
    results.push(result);
  }

  await browser.close();

  // Generate report
  const reportDir = join(__dirname, '..', 'frontend', 'accessibility-reports');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, `a11y-report-${Date.now()}.html`);
  generateHTMLReport(results, reportPath);

  // Check thresholds
  const { totals, failures } = checkThresholds(results);

  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(60));
  console.log(`Critical: ${totals.critical} (threshold: ${THRESHOLDS.critical})`);
  console.log(`Serious:  ${totals.serious} (threshold: ${THRESHOLDS.serious})`);
  console.log(`Moderate: ${totals.moderate} (threshold: ${THRESHOLDS.moderate})`);
  console.log(`Minor:    ${totals.minor} (threshold: ${THRESHOLDS.minor})`);
  console.log('='.repeat(60));

  if (failures.length > 0) {
    console.log('\n❌ THRESHOLD VIOLATIONS:');
    failures.forEach(f => console.log(`   - ${f}`));
    console.log('\n💡 Review the HTML report for details.');
    process.exit(1);
  } else {
    console.log('\n✅ All thresholds passed!');
    process.exit(0);
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
