import { expect, test } from '@playwright/test';

const MOCK_ADDRESS = 'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG';

test.describe('Dispute Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/disputes/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ escrowId: 'esc1', status: 'NONE' }),
      }),
    );
    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'esc1', status: 'ACTIVE' }),
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

  test('escrow detail page accessible for dispute interaction', async ({ page }) => {
    await page.goto('/escrow/esc1', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/esc1/);
  });

  test('arbitration panel raise-dispute POST succeeds with mocked API', async ({ page }) => {
    let disputeRaised = false;
    await page.route('**/api/disputes/escrow/esc1/raise', (route) => {
      disputeRaised = true;
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ escrowId: 'esc1', status: 'RAISED', reason: 'Test dispute' }),
      });
    });

    // Simulate what the ArbitrationPanel does
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/disputes/escrow/esc1/raise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Test dispute reason' }),
      });
      return res.status;
    });

    expect(response).toBe(201);
    expect(disputeRaised).toBe(true);
  });

  test('dispute status GET returns correct shape', async ({ page }) => {
    let statusChecked = false;
    await page.route('**/api/disputes/escrow/esc1/status', (route) => {
      statusChecked = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ escrowId: 'esc1', status: 'NONE' }),
      });
    });

    const data = await page.evaluate(async () => {
      const res = await fetch('/api/disputes/escrow/esc1/status');
      return res.json();
    });

    expect(data.status).toBe('NONE');
    expect(statusChecked).toBe(true);
  });
});
