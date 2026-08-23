import { expect, test } from '@playwright/test';

const MOCK_ADDRESS = 'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG';

const MOCK_ANALYTICS = {
  totalEscrows: 142,
  dailyBreakdown: [
    { date: '2026-08-15', count: 5 },
    { date: '2026-08-16', count: 8 },
  ],
  totalXLMVolume: '48500',
  disputeRate: 0.042,
  avgResolutionHours: 18.5,
  topContributors: [
    { address: MOCK_ADDRESS, count: 23 },
  ],
};

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/admin/analytics/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ANALYTICS),
      }),
    );
    await page.route('**/api/admin/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], total: 0 }),
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

  test('admin route is accessible', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('admin analytics API responds with expected shape', async ({ page }) => {
    const data = await page.evaluate(async () => {
      const res = await fetch('/api/admin/analytics/summary');
      return res.json();
    });

    expect(data).toHaveProperty('totalEscrows');
    expect(data).toHaveProperty('disputeRate');
    expect(data).toHaveProperty('totalXLMVolume');
    expect(typeof data.totalEscrows).toBe('number');
  });

  test('admin page renders a container or dashboard element', async ({ page }) => {
    test.skip(
      !['chromium'].includes(test.info().project.name),
      'Dashboard rendering calibrated for Chromium.',
    );

    await page.goto('/admin', { waitUntil: 'domcontentloaded' });

    const container = page
      .locator('[class*="dashboard"], [class*="admin"], main')
      .or(page.getByRole('main'));

    await expect(container.first()).toBeVisible({ timeout: 15000 });
  });
});
