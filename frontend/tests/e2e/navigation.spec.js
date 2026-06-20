import { expect, test } from '@playwright/test';

test('create escrow route loads successfully', async ({ page }) => {
  test.skip(
    !['chromium'].includes(test.info().project.name),
    'This smoke flow is calibrated for the desktop Chromium project.',
  );

  await page.goto('/escrow/create', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/escrow\/create$/);
  await expect(page.getByRole('heading', { name: 'Create New Escrow' })).toBeVisible();
});
