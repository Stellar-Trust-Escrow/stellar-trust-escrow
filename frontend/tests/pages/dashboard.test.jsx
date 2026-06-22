import { screen } from '@testing-library/react';
import DashboardPage from '../../app/dashboard/page';
import { renderWithAppProviders } from '../test-utils';

const CONNECTED_WALLET = { address: 'GABCD1234', isConnected: true };

function renderDashboard() {
  return renderWithAppProviders(<DashboardPage />, { wallet: CONNECTED_WALLET });
}

beforeEach(() => {
  global.fetch = jest.fn((url) => {
    if (url.includes('/api/users/GABCD1234/escrows')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          escrows: [
            {
              id: 1,
              title: 'Logo Design Project',
              status: 'Active',
              totalAmount: '1,250 USDC',
              milestoneProgress: '1 / 3',
              counterparty: 'GFREE1...1234',
              role: 'client',
            },
            {
              id: 2,
              title: 'Smart Contract Audit',
              status: 'Active',
              totalAmount: '3,000 USDC',
              milestoneProgress: '2 / 4',
              counterparty: 'GFREE2...5678',
              role: 'client',
            },
          ],
        }),
      });
    }

    if (url.includes('/api/reputation/GABCD1234')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ totalScore: 8700 }),
      });
    }

    if (url.includes('/api/escrows/stats/GABCD1234')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          total: 7,
          active: 2,
          completed: 4,
          disputed: 1,
          totalValueLocked: '42500000',
          successRate: 80,
        }),
      });
    }

    if (url.includes('/api/escrows/activity/GABCD1234')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          escrows: [
            {
              id: 1,
              status: 'Active',
              updatedAt: new Date().toISOString(),
              clientAddress: 'GABCD1234',
              freelancerAddress: 'GFREE1ADDRESS',
              totalAmount: '12500000',
            },
          ],
        }),
      });
    }

    return Promise.resolve({
      ok: true,
      json: async () => ({}),
    });
  });
});

afterEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
});

describe('DashboardPage', () => {
  it('renders stat cards', async () => {
    renderDashboard();
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Welcome back.')).toBeInTheDocument();
  });

  it('renders fetched stats values', async () => {
    renderDashboard();
    const totalEscrowsMetric = await screen.findByRole('region', {
      name: /total escrows metric/i,
    });
    const completedMetric = screen.getByRole('region', { name: /completed metric/i });

    expect(totalEscrowsMetric).toHaveTextContent('7');
    expect(completedMetric).toHaveTextContent('4');
  });

  it('renders active escrows section', async () => {
    renderDashboard();
    await screen.findByText('Logo Design Project');
    expect(screen.getByText('Your Active Escrows')).toBeInTheDocument();
  });

  it('renders escrow cards', async () => {
    renderDashboard();
    expect(await screen.findByText('Logo Design Project')).toBeInTheDocument();
    expect(screen.getByText('Smart Contract Audit')).toBeInTheDocument();
  });

  it('renders New Escrow button', async () => {
    renderDashboard();
    await screen.findByText('Logo Design Project');
    expect(screen.getByRole('link', { name: '+ Create Escrow' })).toBeInTheDocument();
  });

  it('renders reputation badge', async () => {
    renderDashboard();
    expect(await screen.findByText('87')).toBeInTheDocument();
  });
});
