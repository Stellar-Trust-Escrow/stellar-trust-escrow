import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ReferralsPage from '../../app/referrals/page';
import api from '../../lib/api/client';

jest.mock('../../lib/api/client', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

let mockAddress = null;
jest.mock('../../hooks/useWallet', () => ({
  useWallet: () => ({ address: mockAddress }),
}));

describe('ReferralsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddress = null;
  });

  it('prompts to connect a wallet when not connected', () => {
    render(<ReferralsPage />);
    expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
  });

  it('shows a code-creation form when connected but no code exists yet', async () => {
    mockAddress = 'GABC...';
    api.get.mockResolvedValue({
      data: { code: null, totalReferrals: 0, pendingEarnings: '0', totalEarned: '0', topReferred: [] },
    });

    render(<ReferralsPage />);

    await waitFor(() => expect(screen.getByLabelText(/create your referral code/i)).toBeInTheDocument());
  });

  it('renders the referral code, share link, and stats once a code exists', async () => {
    mockAddress = 'GABC...';
    api.get.mockResolvedValue({
      data: {
        code: 'ALICE1',
        totalReferrals: 3,
        pendingEarnings: '4.5000000',
        totalEarned: '10.0000000',
        topReferred: [{ escrowId: '42', earnedXlm: '4.5000000' }],
      },
    });

    render(<ReferralsPage />);

    await waitFor(() => expect(screen.getByText('ALICE1')).toBeInTheDocument());
    expect(screen.getByText(/signup\?ref=ALICE1/)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // Total Referrals stat
    expect(screen.getAllByText(/4\.5000000/).length).toBeGreaterThan(0); // pending stat + activity row
    expect(screen.getByRole('link', { name: /share on x/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /share on telegram/i })).toBeInTheDocument();
  });

  it('submits a new code via POST /v1/referrals/codes', async () => {
    mockAddress = 'GABC...';
    api.get
      .mockResolvedValueOnce({
        data: { code: null, totalReferrals: 0, pendingEarnings: '0', totalEarned: '0', topReferred: [] },
      })
      .mockResolvedValueOnce({
        data: { code: 'NEWCODE', totalReferrals: 0, pendingEarnings: '0', totalEarned: '0', topReferred: [] },
      });
    api.post.mockResolvedValue({ data: { code: 'NEWCODE' } });

    render(<ReferralsPage />);
    await waitFor(() => expect(screen.getByLabelText(/create your referral code/i)).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/e\.g\. alice2026/i), { target: { value: 'newcode' } });
    fireEvent.click(screen.getByRole('button', { name: /create code/i }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/v1/referrals/codes', { code: 'NEWCODE' }),
    );
  });

  it('shows an empty state when there is no referral activity yet', async () => {
    mockAddress = 'GABC...';
    api.get.mockResolvedValue({
      data: { code: 'ALICE1', totalReferrals: 0, pendingEarnings: '0', totalEarned: '0', topReferred: [] },
    });

    render(<ReferralsPage />);

    await waitFor(() => expect(screen.getByText(/no referral activity yet/i)).toBeInTheDocument());
  });
});
