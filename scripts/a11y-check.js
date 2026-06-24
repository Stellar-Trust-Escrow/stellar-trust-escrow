import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright';
import fs from 'node:fs';

const PAGES = [
  { name: 'Home', path: '/' },
  { name: 'Dashboard', path: '/dashboard' },
  { name: 'Escrow', path: '/escrow' },
];

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const browser = await chromium.launch();
const context = await browser.newContext();
const results = [];
let totalViolations = 0;

try {
  for (const page of PAGES) {
    const tab = await context.newPage();
    await tab.goto(`${BASE_URL}${page.path}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const report = await new AxeBuilder({ page: tab }).withTags(['wcag2aa']).analyze();
    const { violations } = report;

    totalViolations += violations.length;
    results.push({ page: page.name, path: page.path, violations });

    console.log(`[${page.name}] ${violations.length} violation(s)`);
    for (const violation of violations) {
      console.log(`  [${violation.impact}] ${violation.id}: ${violation.description}`);
      for (const node of violation.nodes) {
        console.log(`     Selector: ${node.target.join(', ')}`);
      }
    }

    await tab.close();
  }

  fs.writeFileSync('a11y-report.json', JSON.stringify(results, null, 2));

  let markdown = '## Accessibility Scan Report\n\n';
  markdown += '| Page | Violations |\n|---|---|\n';
  for (const result of results) {
    markdown += `| ${result.page} | ${result.violations.length} |\n`;
  }

  if (totalViolations > 0) {
    markdown += '\n### Violation Details\n\n';
    for (const result of results) {
      for (const violation of result.violations) {
        markdown += `- **[${violation.impact}]** \`${violation.id}\` on \`${result.path}\`: ${violation.description}\n`;
      }
    }
  }

  fs.writeFileSync('a11y-report.md', markdown);

  if (totalViolations > 0) {
    console.error(`\nFAIL: ${totalViolations} WCAG 2 AA violation(s) found.`);
    process.exitCode = 1;
  } else {
    console.log('\nPASS: No WCAG 2 AA violations found.');
  }
} finally {
  await browser.close();
}
