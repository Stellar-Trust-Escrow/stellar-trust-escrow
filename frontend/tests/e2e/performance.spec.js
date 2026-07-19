import { expect, test } from '@playwright/test';

test.describe('performance smoke', () => {
  test('landing page renders key content within budget', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'chromium',
      'Performance assertions are calibrated for the desktop Chromium project.',
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });

    // toBeVisible() is a DOM/CSS check, not a rendering-pipeline check.
    // Wait for the browser's first-contentful-paint entry before reading
    // performance metrics — otherwise FCP may not be recorded yet.
    await page.waitForFunction(
      () => performance.getEntriesByType('paint').some((e) => e.name === 'first-contentful-paint'),
      { timeout: 15_000 },
    );

    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const paintEntries = performance.getEntriesByType('paint');
      const firstContentfulPaint = paintEntries.find(
        (entry) => entry.name === 'first-contentful-paint',
      );

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
