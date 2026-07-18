import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Keypair, hash } from '@stellar/stellar-sdk';
import ProfilePage from '../../app/profile/[address]/page';
import ReputationCard from '../../components/profile/ReputationCard';
import {
  calculateTrustScore,
  calculateWinRate,
  generateIdenticon,
  getReputation,
  verifyIdentitySignature,
} from '../../lib/stellar';

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
const OTHER_ADDRESS = Keypair.random().publicKey();
const SIGNED_MESSAGE_PREFIX = 'Stellar Signed Message:\n';

function reputation(overrides = {}) {
  return {
    address: ADDRESS,
    totalScore: 0,
    completedEscrows: 0,
    disputedEscrows: 0,
    disputesWon: 0,
    totalVolume: '0',
    slashCount: 0,
    totalSlashed: '0',
    lastUpdated: 0,
    ...overrides,
  };
}

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: async () => body,
  });
}

describe('profile reputation calculations', () => {
  it('returns zero trust score when there is no history', () => {
    expect(calculateTrustScore(0, 0, 0)).toBe(0);
    expect(calculateWinRate(0, 0)).toBe(0);
  });

  it('subtracts two points for every lost dispute', () => {
    expect(calculateTrustScore(0, 3, 0)).toBe(-6);
    expect(calculateTrustScore(4, 3, 0)).toBe(-2);
  });

  it('calculates dispute win rate and guards inconsistent values', () => {
    expect(calculateWinRate(4, 3)).toBe(75);
    expect(calculateWinRate(2, 5)).toBe(100);
    expect(calculateTrustScore(5, 2, 5)).toBe(5);
  });
});

describe('profile identicon', () => {
  it('is deterministic for the same address', () => {
    expect(generateIdenticon(ADDRESS)).toEqual(generateIdenticon(ADDRESS));
  });

  it('produces a different pattern for a different address', () => {
    expect(generateIdenticon(ADDRESS)).not.toEqual(generateIdenticon(OTHER_ADDRESS));
  });
});

describe('identity signature verification', () => {
  it('accepts a correctly signed Freighter-style message', () => {
    const keypair = Keypair.random();
    const message = `Trustchain identity: ${keypair.publicKey()} at 1700000000000`;
    const messageHash = hash(Buffer.from(`${SIGNED_MESSAGE_PREFIX}${message}`, 'utf8'));
    const signature = keypair.sign(messageHash).toString('base64');

    expect(verifyIdentitySignature(message, signature, keypair.publicKey())).toBe(true);
  });

  it('rejects the signature when the message is altered', () => {
    const keypair = Keypair.random();
    const message = `Trustchain identity: ${keypair.publicKey()} at 1700000000000`;
    const messageHash = hash(Buffer.from(`${SIGNED_MESSAGE_PREFIX}${message}`, 'utf8'));
    const signature = keypair.sign(messageHash).toString('base64');

    expect(
      verifyIdentitySignature(`${message} altered`, signature, keypair.publicKey()),
    ).toBe(false);
  });
});

describe('ReputationCard', () => {
  it('shows the empty state and describes the trust score formula', () => {
    render(<ReputationCard reputation={reputation()} />);

    expect(screen.getByText('No history yet')).toBeInTheDocument();
    const trustScore = screen.getByText('0', { selector: 'dd[aria-describedby]' });
    expect(trustScore).toHaveAttribute('aria-describedby', 'trust-score-formula');
    expect(screen.getByText(/Trust score = completed escrows/)).toBeInTheDocument();
  });

  it('renders the all-disputes-lost edge case', () => {
    render(
      <ReputationCard
        reputation={reputation({ completedEscrows: 0, disputedEscrows: 2, disputesWon: 0 })}
      />,
    );

    expect(screen.getByText('-4')).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });
});

describe('ProfilePage fallbacks and accessibility', () => {
  beforeEach(() => {
    getReputation.mockReset();
    global.fetch = jest.fn();
  });

  it('keeps the page usable when reputation and API fetches fail', async () => {
    getReputation.mockRejectedValue(new Error('RPC unavailable'));
    global.fetch.mockImplementation(() => jsonResponse({}, false, 401));

    render(<ProfilePage params={{ address: ADDRESS }} />);

    expect(screen.getByRole('heading', { name: 'Identity' })).toBeInTheDocument();
    expect(
      await screen.findByText('Reputation data is currently unavailable.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Escrow stats are currently unavailable.')).toBeInTheDocument();
    expect(
      await screen.findByText('Escrow history is currently unavailable.'),
    ).toBeInTheDocument();
  });

  it('exposes exact status values through accessible bar labels', async () => {
    getReputation.mockResolvedValue(
      reputation({ completedEscrows: 2, totalScore: 20, totalVolume: '30000000' }),
    );
    global.fetch.mockImplementation((url) => {
      if (url.includes('/stats')) {
        return jsonResponse({
          totalEscrows: 3,
          escrowsByStatus: { Active: 1, Completed: 2, Disputed: 0, Cancelled: 0 },
        });
      }
      return jsonResponse({
        data: [],
        page: 1,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    render(<ProfilePage params={{ address: ADDRESS }} />);

    expect(await screen.findByRole('img', { name: 'Active escrows: 1' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Completed escrows: 2' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Disputed escrows: 0' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cancelled escrows: 0' })).toBeInTheDocument();
  });

  it('requests the next offset page from the history endpoint', async () => {
    getReputation.mockResolvedValue(reputation());
    global.fetch.mockImplementation((url) => {
      if (url.includes('/stats')) {
        return jsonResponse({ totalEscrows: 1, escrowsByStatus: { Active: 1 } });
      }
      return jsonResponse({
        data: [{ id: '1', status: 'Active', totalAmount: '10000000' }],
        page: url.includes('page=2') ? 2 : 1,
        totalPages: 2,
        hasNextPage: !url.includes('page=2'),
        hasPreviousPage: url.includes('page=2'),
      });
    });

    render(<ProfilePage params={{ address: ADDRESS }} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('role=all&page=2&limit=10'),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });
});
