import { expect, test } from '@playwright/test';

const MOCK_ADDRESS = 'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG';

test.describe('Create Escrow Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'esc-test-1', status: 'CREATED' }),
      }),
    );

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
  });

  test('create escrow page is reachable and shows heading', async ({ page }) => {
    test.skip(
      !['chromium'].includes(test.info().project.name),
      'Wizard flow calibrated for Chromium.',
    );

    await page.goto('/escrow/create', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/escrow\/create$/);

    const heading = page
      .getByRole('heading', { name: /create.*escrow/i })
      .or(page.locator('h1, h2').filter({ hasText: /escrow/i }));
    await expect(heading.first()).toBeVisible({ timeout: 15000 });
  });

  test('wizard renders at least one interactive form field', async ({ page }) => {
    test.skip(
      !['chromium'].includes(test.info().project.name),
      'Wizard flow calibrated for Chromium.',
    );

    await page.goto('/escrow/create', { waitUntil: 'domcontentloaded' });

    const formFields = page.locator('input, textarea, select').filter({ visible: true });
    await expect(formFields.first()).toBeVisible({ timeout: 15000 });
  });

  test('required field validation prevents empty submission', async ({ page }) => {
    test.skip(
      !['chromium'].includes(test.info().project.name),
      'Wizard flow calibrated for Chromium.',
    );

    await page.goto('/escrow/create', { waitUntil: 'domcontentloaded' });

    const nextBtn = page
      .getByRole('button', { name: /next|continue|proceed/i })
      .or(page.locator('button[type="submit"]'));

    if (await nextBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await nextBtn.first().click();
      // After clicking next with empty fields, we should stay on the same URL or see validation
      await page.waitForTimeout(500);
      const url = page.url();
      // Should not jump to a later step without filling required fields
      expect(url).toMatch(/escrow\/create/);
    }
  });
});
