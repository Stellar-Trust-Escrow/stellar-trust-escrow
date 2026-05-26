import { expect, test } from '@playwright/test';

test.describe('visual regression', () => {
  test('landing page matches the approved baseline', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium', 'Visual baselines are maintained for Chromium.');

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('home-page.png');
  });

  test('create escrow page matches the approved baseline', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium', 'Visual baselines are maintained for Chromium.');

    await page.goto('/escrow/create', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Create New Escrow' })).toBeVisible();
    const screenshot = await page.screenshot({ fullPage: true });
    expect(screenshot).toMatchSnapshot('create-escrow-page.png');
  });
});
