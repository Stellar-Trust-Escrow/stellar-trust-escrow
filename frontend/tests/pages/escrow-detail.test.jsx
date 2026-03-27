import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import EscrowDetailPage from '../../app/escrow/[id]/page';

// Mock useEscrow so tests don't hit the network.
const mockMutate = jest.fn().mockResolvedValue(undefined);

jest.mock('../../hooks/useEscrow', () => ({
  useEscrow: () => ({
    escrow: null,   // page falls back to PLACEHOLDER_ESCROW
    isLoading: false,
    error: null,
    mutate: mockMutate,
  }),
}));

// Mock components that require context providers not set up in tests.
jest.mock('../../components/ui/CurrencyAmount', () =>
  function CurrencyAmount({ amount }) {
    return <span>{amount}</span>;
  }
);

jest.mock('../../components/escrow/MilestoneList', () =>
  function MilestoneList({ milestones }) {
    return (
      <ul>
        {milestones.map((m) => (
          <li key={m.id}>{m.title}</li>
        ))}
      </ul>
    );
  }
);

const params = { id: '1' };

beforeEach(() => {
  mockMutate.mockClear();
});

describe('EscrowDetailPage', () => {
  it('renders escrow title', () => {
    render(<EscrowDetailPage params={params} />);
    expect(screen.getByText('Smart Contract Audit')).toBeInTheDocument();
  });

  it('renders escrow status badge', () => {
    render(<EscrowDetailPage params={params} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders escrow ID', () => {
    render(<EscrowDetailPage params={params} />);
    expect(screen.getByText('Escrow #1')).toBeInTheDocument();
  });

  it('renders info cells', () => {
    render(<EscrowDetailPage params={params} />);
    expect(screen.getByText('2,000 USDC')).toBeInTheDocument();
    expect(screen.getByText('1,500 USDC')).toBeInTheDocument();
  });

  it('renders Raise Dispute button for active escrow', () => {
    render(<EscrowDetailPage params={params} />);
    expect(screen.getByRole('button', { name: /Raise Dispute/ })).toBeInTheDocument();
  });

  it('opens dispute modal when Raise Dispute is clicked', () => {
    render(<EscrowDetailPage params={params} />);
    fireEvent.click(screen.getByRole('button', { name: /Raise Dispute/ }));
    expect(screen.getByText('Raise Dispute')).toBeInTheDocument();
    // 'Escrow #1' appears in both the page subtitle and the modal header
    expect(screen.getAllByText(/Escrow #1/).length).toBeGreaterThan(0);
  });

  it('closes dispute modal when Cancel is clicked', () => {
    render(<EscrowDetailPage params={params} />);
    fireEvent.click(screen.getByRole('button', { name: /Raise Dispute/ }));
    fireEvent.click(screen.getByText('Cancel'));
    // Modal should close - the backdrop should be gone
    expect(screen.queryByText(/freeze all funds/)).not.toBeInTheDocument();
  });

  it('renders milestones section', () => {
    render(<EscrowDetailPage params={params} />);
    expect(screen.getByRole('heading', { name: 'Milestones' })).toBeInTheDocument();
  });

  it('renders all 3 milestones', () => {
    render(<EscrowDetailPage params={params} />);
    expect(screen.getByText('Codebase Review')).toBeInTheDocument();
    expect(screen.getByText('Vulnerability Report')).toBeInTheDocument();
    expect(screen.getByText('Final Sign-off')).toBeInTheDocument();
  });

  it('renders party cards', () => {
    render(<EscrowDetailPage params={params} />);
    expect(screen.getByText('Client')).toBeInTheDocument();
    expect(screen.getByText('Freelancer')).toBeInTheDocument();
  });

  // Auto-refresh tests
  describe('auto-refresh', () => {
    it('shows last updated timestamp on mount', () => {
      render(<EscrowDetailPage params={params} />);
      expect(screen.getByTestId('last-refreshed')).toHaveTextContent(/Last updated:/);
    });

    it('renders a manual Refresh button', () => {
      render(<EscrowDetailPage params={params} />);
      expect(screen.getByRole('button', { name: /Refresh escrow data/ })).toBeInTheDocument();
    });

    it('calls mutate when the Refresh button is clicked', async () => {
      render(<EscrowDetailPage params={params} />);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Refresh escrow data/ }));
      });
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    it('updates the last updated timestamp after a manual refresh', async () => {
      render(<EscrowDetailPage params={params} />);

      const timestampBefore = screen.getByTestId('last-refreshed').textContent;

      // Advance time so the new timestamp will differ
      jest.useFakeTimers();
      jest.advanceTimersByTime(5000);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Refresh escrow data/ }));
      });

      await waitFor(() => {
        expect(screen.getByTestId('last-refreshed').textContent).not.toBe(timestampBefore);
      });

      jest.useRealTimers();
    });
  });
});
