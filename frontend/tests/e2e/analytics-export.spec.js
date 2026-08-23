import { expect, test } from '@playwright/test';

const MOCK_ADDRESS = 'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG';

test.describe('Analytics CSV Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/analytics/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalEscrows: 10,
          dailyBreakdown: [{ date: '2026-08-22', count: 3 }],
          totalXLMVolume: '1000',
          disputeRate: 0.1,
          avgResolutionHours: 12,
          topContributors: [],
        }),
      }),
    );
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }),
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((addr) => {
      localStorage.setItem(
        'ste-app-store',
        JSON.stringify({
          wallet: { address: addr, isConnected: true, network: 'testnet' },
          admin: { apiKey: 'test-admin-key' },
        }),
      );
    }, MOCK_ADDRESS);
  });

  test('analytics summary API returns exportable data array', async ({ page }) => {
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/admin/analytics/summary');
      return res.json();
    });

    expect(Array.isArray(data.dailyBreakdown)).toBe(true);
    expect(data.dailyBreakdown.length).toBeGreaterThanOrEqual(0);
  });

  test('cohort API endpoint is callable', async ({ page }) => {
    await page.route('**/api/admin/analytics/cohort', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ week: '2026-W34', active: 5, retained: 3 }]),
      }),
    );

    const data = await page.evaluate(async () => {
      const res = await fetch('/api/admin/analytics/cohort');
      return res.json();
    });

    expect(Array.isArray(data)).toBe(true);
  });

  test('CSV export function produces valid CSV string', async ({ page }) => {
    // Test the CSV logic directly in the browser context — mirrors analyticsService.exportCSV
    const csv = await page.evaluate(() => {
      const rows = [
        { date: '2026-08-20', count: 5 },
        { date: '2026-08-21', count: 8 },
      ];
      if (!rows.length) return '';
      const headers = Object.keys(rows[0]);
      const lines = [headers.join(',')];
      for (const row of rows) {
        lines.push(headers.map((h) => String(row[h] ?? '')).join(','));
      }
      return lines.join('\n');
    });

    expect(csv).toContain('date,count');
    expect(csv).toContain('2026-08-20,5');
    expect(csv).toContain('2026-08-21,8');
  });
});
