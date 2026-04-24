import { expect, test } from '@playwright/test';

test.describe('performance smoke', () => {
  test('landing page renders key content within budget', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'chromium',
      'Performance assertions are calibrated for the desktop Chromium project.',
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 2500 });

    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const paintEntries = performance.getEntriesByType('paint');
      const firstContentfulPaint = paintEntries.find((entry) => entry.name === 'first-contentful-paint');

      return {
        domContentLoaded: navigation?.domContentLoadedEventEnd ?? 0,
        loadEventEnd: navigation?.loadEventEnd ?? 0,
        firstContentfulPaint: firstContentfulPaint?.startTime ?? 0,
      };
    });

    expect(metrics.firstContentfulPaint).toBeGreaterThan(0);
    expect(metrics.firstContentfulPaint).toBeLessThan(20_000);
    expect(metrics.domContentLoaded).toBeLessThan(20_000);
    expect(metrics.loadEventEnd).toBeLessThan(25_000);
  });
});
