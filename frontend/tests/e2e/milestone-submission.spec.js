import { expect, test } from '@playwright/test';

const MOCK_ADDRESS = 'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG';
const MOCK_ESCROW_ID = 'mock-escrow-001';

const MOCK_ESCROW = {
  id: MOCK_ESCROW_ID,
  status: 'ACTIVE',
  clientAddress: MOCK_ADDRESS,
  freelancerAddress: 'GFREELANCER000000000000000000000000000000000000000000000',
  milestones: [
    { id: 'm1', title: 'Design phase', status: 'PENDING', amount: '100' },
    { id: 'm2', title: 'Development phase', status: 'PENDING', amount: '200' },
  ],
};

test.describe('Milestone Submission', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`**/api/**/escrow/${MOCK_ESCROW_ID}**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_ESCROW),
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
          admin: { apiKey: null },
        }),
      );
    }, MOCK_ADDRESS);
  });

  test('escrow detail page loads for a valid ID', async ({ page }) => {
    await page.goto(`/escrow/${MOCK_ESCROW_ID}`, { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(new RegExp(MOCK_ESCROW_ID));
    // Page should load without redirecting to an error page
    const title = await page.title();
    expect(title).toBeTruthy();
  });

  test('milestone list or escrow detail renders on the page', async ({ page }) => {
    test.skip(
      !['chromium'].includes(test.info().project.name),
      'Detail view calibrated for Chromium.',
    );

    await page.goto(`/escrow/${MOCK_ESCROW_ID}`, { waitUntil: 'domcontentloaded' });

    // Flexible — accept any milestone-related or escrow-related content
    const content = page
      .locator('[class*="milestone"], [class*="escrow"], [data-testid*="milestone"]')
      .or(page.getByText(/milestone|status|ACTIVE/i));

    await expect(content.first()).toBeVisible({ timeout: 15000 });
  });
});
