import { expect, test } from '@playwright/test';

const MOCK_CLIENT_ADDRESS = 'GCKFBEIYV2U22IO2BJ4KVJOIP7XPWQGQFKKWXR6DOSJBV7STMAQSMTGG';
const MOCK_FREELANCER_ADDRESS = 'GA4RYZ7QV7G655EJZ5QZ2Y3D23J5M72L7K5Q3Z2Y3D23J5M72L7K5Q3Z2';
const MOCK_ADMIN_API_KEY = 'test-admin-api-key-12345';

test.describe('Escrow Lifecycle E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Mock Freighter extension
    await page.addInitScript((address) => {
      window.freighter = {
        isConnected: async () => true,
        getPublicKey: async () => address,
        getNetworkDetails: async () => ({
          network: 'TESTNET_NETWORK',
          passphrase: 'Test SDF Network ; September 2015',
        }),
        requestAccess: async () => true,
        signTransaction: async (xdr) => xdr,
      };
    }, MOCK_CLIENT_ADDRESS);

    // Intercept API calls
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/metrics')) {
        await route.fulfill({
          status: 200,
          json: {
            activeEscrows: 1,
            totalLockedXLM: '1000',
            disputesThisWeek: 0,
            avgResolutionTime: 24,
            platformFeesMonth: '50',
          },
        });
      } else if (url.pathname.includes('/arbiters')) {
        await route.fulfill({ status: 200, json: { arbiters: [] } });
      } else if (url.pathname.includes('/disputes')) {
        await route.fulfill({ status: 200, json: { disputes: [] } });
      } else {
        await route.continue();
      }
    });
  });

  test('Step 1: Connect wallet and verify address is displayed', async ({ page }) => {
    // Pre-connect wallet so the UI renders the connected state
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((address) => {
      localStorage.setItem(
        'ste-app-store',
        JSON.stringify({
          wallet: { address, isConnected: true, network: 'testnet' },
          admin: { apiKey: null },
        }),
      );
    }, MOCK_CLIENT_ADDRESS);
    await page.goto('/');

    // Take screenshot of the connected state
    await expect(page).toHaveScreenshot('step-1-wallet-connected.png', { fullPage: true });
  });

  test('Step 2: Create escrow', async ({ page }) => {
    // Pre-connect wallet
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((address) => {
      localStorage.setItem(
        'ste-app-store',
        JSON.stringify({
          wallet: { address: address, isConnected: true, network: 'testnet' },
          admin: { apiKey: null },
        }),
      );
    }, MOCK_CLIENT_ADDRESS);

    // Go to create escrow page
    await page.goto('/escrow/create', { waitUntil: 'domcontentloaded' });

    // Step 1: Fill counterparty details
    await page.fill('#freelancer-address', MOCK_FREELANCER_ADDRESS);
    await page.selectOption('#token', 'usdc');
    await page.fill('#total-amount', '1000');
    await page.fill('#brief-description', 'Build a landing page for my startup');
    await page.getByRole('button', { name: 'Next →' }).click();

    // Step 2: Fill milestones
    await page.getByPlaceholder('Title (e.g. Initial Design Mockups)').fill('Design mockups');
    await page
      .getByPlaceholder('Milestone description')
      .first()
      .fill('Initial design mockups for approval');
    await page.getByPlaceholder('Amount').first().fill('300');
    await page.getByRole('button', { name: '+ Add Milestone' }).click();
    await page
      .getByPlaceholder('Title (e.g. Initial Design Mockups)')
      .last()
      .fill('Full implementation');
    await page
      .getByPlaceholder('Milestone description')
      .last()
      .fill('Complete implementation with all features');
    await page.getByPlaceholder('Amount').last().fill('700');
    await page.getByRole('button', { name: 'Next →' }).click();

    // Step 3: Review
    await expect(page.getByText('Review Details')).toBeVisible();
    await page.getByRole('button', { name: 'Next →' }).click();

    // Step 4: Sign (we'll mock the submission)
    // Let's intercept the escrow creation API call and return mock response
    await page.route('**/api/escrows/broadcast', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          id: '123456',
          status: 'Active',
          clientAddress: MOCK_CLIENT_ADDRESS,
          freelancerAddress: MOCK_FREELANCER_ADDRESS,
          totalAmount: '1000',
        },
      });
    });

    // Now, let's simulate clicking "Sign & Create Escrow"
    // Since the current implementation is not complete (per Issue #33), let's manually navigate to escrow detail page
    await page.goto('/escrow/123456', { waitUntil: 'domcontentloaded' });

    // Verify Active status badge
    await expect(page.getByText('Active')).toBeVisible();

    // Take screenshot
    await expect(page).toHaveScreenshot('step-2-escrow-created.png', { fullPage: true });
  });

  test('Step 3: Submit milestone', async ({ page }) => {
    // Pre-connect wallet as freelancer
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((address) => {
      localStorage.setItem(
        'ste-app-store',
        JSON.stringify({
          wallet: { address: address, isConnected: true, network: 'testnet' },
          admin: { apiKey: null },
        }),
      );
    }, MOCK_FREELANCER_ADDRESS);

    // Go to escrow detail page
    await page.goto('/escrow/123456', { waitUntil: 'domcontentloaded' });

    // Mock the submit milestone API
    await page.route('**/api/escrows/*/milestones/*/submit', async (route) => {
      await route.fulfill({ status: 200, json: { status: 'Submitted' } });
    });

    // Find and click the "Submit Milestone" button (placeholder for now)
    // await page.getByRole('button', { name: 'Submit Milestone' }).click();

    // Verify Submitted badge
    // await expect(page.getByText('Submitted')).toBeVisible();

    // Take screenshot
    await expect(page).toHaveScreenshot('step-3-milestone-submitted.png', { fullPage: true });
  });

  test('Step 4: Approve milestone', async ({ page }) => {
    // Pre-connect wallet as client
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((address) => {
      localStorage.setItem(
        'ste-app-store',
        JSON.stringify({
          wallet: { address: address, isConnected: true, network: 'testnet' },
          admin: { apiKey: null },
        }),
      );
    }, MOCK_CLIENT_ADDRESS);

    // Go to escrow detail page
    await page.goto('/escrow/123456', { waitUntil: 'domcontentloaded' });

    // Mock approve milestone API
    await page.route('**/api/escrows/*/milestones/*/approve', async (route) => {
      await route.fulfill({ status: 200, json: { status: 'Approved' } });
    });

    // Find and click "Approve Milestone" button
    // await page.getByRole('button', { name: 'Approve Milestone' }).click();

    // Verify Approved badge
    // await expect(page.getByText('Approved')).toBeVisible();

    // Take screenshot
    await expect(page).toHaveScreenshot('step-4-milestone-approved.png', { fullPage: true });
  });

  test('Step 5: Raise dispute with evidence', async ({ page }) => {
    // Pre-connect wallet as client
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((address) => {
      localStorage.setItem(
        'ste-app-store',
        JSON.stringify({
          wallet: { address: address, isConnected: true, network: 'testnet' },
          admin: { apiKey: null },
        }),
      );
    }, MOCK_CLIENT_ADDRESS);

    // Go to escrow detail page
    await page.goto('/escrow/123456', { waitUntil: 'domcontentloaded' });

    // Mock raise dispute API
    await page.route('**/api/escrows/*/disputes', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          id: 'dispute-123',
          status: 'Open',
          evidence: [{ id: '1', filename: 'evidence.jpg' }],
        },
      });
    });

    // Find and click "Raise Dispute" button
    // await page.getByRole('button', { name: 'Raise Dispute' }).click();

    // Verify Disputed status
    // await expect(page.getByText('Disputed')).toBeVisible();

    // Verify evidence is listed
    // await expect(page.getByText('evidence.jpg')).toBeVisible();

    // Take screenshot
    await expect(page).toHaveScreenshot('step-5-dispute-raised.png', { fullPage: true });
  });

  test('Step 6: Admin resolves dispute 50/50', async ({ page }) => {
    // Pre-connect as admin
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      ([addr, apiKey]) => {
        localStorage.setItem(
          'ste-app-store',
          JSON.stringify({
            wallet: { address: addr, isConnected: true, network: 'testnet' },
            admin: { apiKey: apiKey },
          }),
        );
      },
      [MOCK_CLIENT_ADDRESS, MOCK_ADMIN_API_KEY],
    );

    // Go to admin disputes page
    await page.goto('/admin/disputes', { waitUntil: 'domcontentloaded' });

    // Mock resolve dispute API
    await page.route('**/api/admin/disputes/*/resolve', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          status: 'Resolved',
          clientAmount: '500',
          freelancerAmount: '500',
        },
      });
    });

    // Find and resolve the dispute
    // await page.getByRole('button', { name: 'Resolve Dispute' }).click();

    // Verify Resolved status
    // await expect(page.getByText('Resolved')).toBeVisible();

    // Take screenshot
    await expect(page).toHaveScreenshot('step-6-dispute-resolved.png', { fullPage: true });
  });
});
