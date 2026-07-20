import { render, screen } from '@testing-library/react';
import { Keypair } from '@stellar/stellar-sdk';
import ProfilePage from '../../app/profile/[address]/page';
import { getReputation } from '../../lib/stellar';

jest.mock('../../hooks/useWallet', () => ({
  useWallet: () => ({
    address: null,
    isConnected: false,
  }),
}));

jest.mock('../../lib/stellar', () => {
  const actual = jest.requireActual('../../lib/stellar');
  return {
    ...actual,
    getReputation: jest.fn(),
  };
});

const ADDRESS = Keypair.random().publicKey();

function jsonResponse(body) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

describe('ProfilePage', () => {
  beforeEach(() => {
    getReputation.mockResolvedValue({
      address: ADDRESS,
      totalScore: 87,
      completedEscrows: 12,
      disputedEscrows: 1,
      disputesWon: 0,
      totalVolume: '184500000000',
      slashCount: 0,
      totalSlashed: '0',
      lastUpdated: 0,
    });

    global.fetch = jest.fn((url) => {
      if (url.includes('/stats')) {
        return jsonResponse({
          totalEscrows: 14,
          escrowsByStatus: { Active: 1, Completed: 12, Disputed: 1, Cancelled: 0 },
        });
      }

      return jsonResponse({
        data: [{ id: '42', status: 'Completed', totalAmount: '10000000' }],
        page: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });
  });

  function renderProfilePage() {
    return render(<ProfilePage params={{ address: ADDRESS }} />);
  }

  it('renders the profile identity for the route address', () => {
    renderProfilePage();

    expect(screen.getByRole('heading', { name: 'Identity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Copy address ${ADDRESS}` })).toBeInTheDocument();
  });

  it('renders the deterministic identicon and Stellar Expert link', () => {
    renderProfilePage();

    expect(screen.getByRole('img', { name: `Identicon for ${ADDRESS}` })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View on Stellar Expert' })).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/testnet/account/${ADDRESS}`,
    );
  });

  it('renders the fetched on-chain reputation score', async () => {
    renderProfilePage();

    expect(await screen.findByText('87')).toBeInTheDocument();
    expect(screen.getByText('On-chain score')).toBeInTheDocument();
  });

  it('renders calculated trust score and win rate', async () => {
    renderProfilePage();

    expect(await screen.findByText('10', { selector: 'dd[aria-describedby]' })).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });

  it('renders accessible escrow status bars', async () => {
    renderProfilePage();

    expect(
      await screen.findByRole('img', { name: 'Completed escrows: 12' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Disputed escrows: 1' })).toBeInTheDocument();
  });

  it('renders escrow history returned by the paginated endpoint', async () => {
    renderProfilePage();

    expect(await screen.findByText('Escrow #42')).toBeInTheDocument();
    expect(screen.getByText('1 XLM')).toBeInTheDocument();
  });
});
