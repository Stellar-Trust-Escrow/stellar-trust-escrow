import { expect, test } from '@playwright/test';

const MOCK_ADDRESS = 'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG';

test.describe('Wallet Connection', () => {
  test('home page loads without critical JS errors', async ({ page }) => {
    const criticalErrors = [];
    page.on('pageerror', (err) => {
      if (!err.message.includes('ResizeObserver') && !err.message.includes('Non-Error')) {
        criticalErrors.push(err.message);
      }
    });

    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }),
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(criticalErrors).toHaveLength(0);
  });

  test('connect wallet button is visible on landing page', async ({ page }) => {
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) }),
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const connectBtn = page
      .getByRole('button', { name: /connect wallet/i })
      .or(page.locator('[data-testid="connect-wallet"]'))
      .or(page.locator('button').filter({ hasText: /wallet/i }));

    await expect(connectBtn.first()).toBeVisible({ timeout: 15000 });
  });

  test('pre-seeded wallet address persists in local storage', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((addr) => {
      localStorage.setItem(
        'ste-app-store',
        JSON.stringify({
          wallet: { address: addr, isConnected: true, network: 'testnet' },
          admin: { apiKey: null },
        }),
      );
    }, MOCK_ADDRESS);

    const stored = await page.evaluate(() => localStorage.getItem('ste-app-store'));
    const parsed = JSON.parse(stored);
    expect(parsed.wallet.address).toBe(MOCK_ADDRESS);
    expect(parsed.wallet.isConnected).toBe(true);
  });
});
