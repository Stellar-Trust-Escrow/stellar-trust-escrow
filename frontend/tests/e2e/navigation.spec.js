import { expect, test } from '@playwright/test';

const MOCK_ADDRESS = 'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG';

test('create escrow route loads successfully', async ({ page }) => {
  test.skip(
    !['chromium'].includes(test.info().project.name),
    'This smoke flow is calibrated for the desktop Chromium project.',
  );

  // Pre-seed wallet auth so RouteGuard doesn't redirect unauthenticated users
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

  await page.goto('/escrow/create', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/escrow\/create$/);
  await expect(page.getByRole('heading', { name: 'Create New Escrow' })).toBeVisible();
});
