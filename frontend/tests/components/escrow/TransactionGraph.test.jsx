import { screen, fireEvent, within } from '@testing-library/react';
import TransactionGraph from '../../../components/escrow/TransactionGraph';
import { renderWithAppProviders } from '../../test-utils';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseEscrow = {
  id: 1,
  status: 'Active',
  clientAddress: 'GCLIENT123',
  freelancerAddress: 'GFREELANCER456',
  contractAddress: 'GCONTRACT789',
  totalAmount: '1000000000',
  platformFee: '10000000',
  transactionHash: 'abc123txhash',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TransactionGraph', () => {
  describe('rendering', () => {
    it('renders the Fund Flow heading', () => {
      renderWithAppProviders(<TransactionGraph escrow={baseEscrow} />);
      expect(screen.getByText('Fund Flow')).toBeInTheDocument();
    });

    it('renders the SVG graph container', () => {
      const { container } = renderWithAppProviders(<TransactionGraph escrow={baseEscrow} />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('renders all four node labels in the SVG', () => {
      const { container } = renderWithAppProviders(<TransactionGraph escrow={baseEscrow} />);
      const svg = container.querySelector('svg');
      expect(svg.textContent).toContain('Buyer Wallet');
      expect(svg.textContent).toContain('Escrow Contract');
      expect(svg.textContent).toContain('Platform Treasury');
      expect(svg.textContent).toContain('Freelancer Wallet');
    });

    it('renders the accessibility table toggle', () => {
      renderWithAppProviders(<TransactionGraph escrow={baseEscrow} />);
      expect(screen.getByText(/view as table/i)).toBeInTheDocument();
    });
  });

  describe('status-based edges', () => {
    it('shows Deposit edge for Active status', () => {
      const { container } = renderWithAppProviders(<TransactionGraph escrow={baseEscrow} />);
      expect(container.querySelector('svg').textContent).toContain('Deposit');
    });

    it('shows Payout and Fee edges for Completed status', () => {
      const { container } = renderWithAppProviders(
        <TransactionGraph escrow={{ ...baseEscrow, status: 'Completed' }} />,
      );
      const svgText = container.querySelector('svg').textContent;
      expect(svgText).toContain('Payout');
      expect(svgText).toContain('Fee');
    });

    it('shows Refund edge for Cancelled status', () => {
      const { container } = renderWithAppProviders(
        <TransactionGraph escrow={{ ...baseEscrow, status: 'Cancelled' }} />,
      );
      expect(container.querySelector('svg').textContent).toContain('Refund');
    });

    it('shows Locked edge for Disputed status', () => {
      const { container } = renderWithAppProviders(
        <TransactionGraph escrow={{ ...baseEscrow, status: 'Disputed' }} />,
      );
      expect(container.querySelector('svg').textContent).toContain('Locked');
    });

    it('falls back to Active edges for unknown status', () => {
      const { container } = renderWithAppProviders(
        <TransactionGraph escrow={{ ...baseEscrow, status: 'Unknown' }} />,
      );
      expect(container.querySelector('svg').textContent).toContain('Deposit');
    });
  });

  describe('node interaction', () => {
    it('opens detail popover when a node is clicked', () => {
      renderWithAppProviders(<TransactionGraph escrow={baseEscrow} />);
      const buyerBtn = screen.getByRole('button', { name: /buyer wallet/i });
      fireEvent.click(buyerBtn);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('shows client address in buyer node detail', () => {
      renderWithAppProviders(<TransactionGraph escrow={baseEscrow} />);
      fireEvent.click(screen.getByRole('button', { name: /buyer wallet/i }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(/GCLIENT123/)).toBeInTheDocument();
    });

    it('shows freelancer address in freelancer node detail', () => {
      renderWithAppProviders(<TransactionGraph escrow={baseEscrow} />);
      fireEvent.click(screen.getByRole('button', { name: /freelancer wallet/i }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(/GFREELANCER456/)).toBeInTheDocument();
    });

    it('shows TX hash in node detail', () => {
      renderWithAppProviders(<TransactionGraph escrow={baseEscrow} />);
      fireEvent.click(screen.getByRole('button', { name: /buyer wallet/i }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(/abc123txhash/)).toBeInTheDocument();
    });

    it('closes detail popover when close button is clicked', () => {
      renderWithAppProviders(<TransactionGraph escrow={baseEscrow} />);
      fireEvent.click(screen.getByRole('button', { name: /buyer wallet/i }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /close/i }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('toggles popover off when the same node is clicked twice', () => {
      renderWithAppProviders(<TransactionGraph escrow={baseEscrow} />);
      const btn = screen.getByRole('button', { name: /buyer wallet/i });
      fireEvent.click(btn);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      fireEvent.click(btn);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('opens detail via keyboard Enter key', () => {
      renderWithAppProviders(<TransactionGraph escrow={baseEscrow} />);
      const btn = screen.getByRole('button', { name: /buyer wallet/i });
      fireEvent.keyDown(btn, { key: 'Enter' });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('accessibility table', () => {
    it('renders a table with From/To/Type columns when expanded', () => {
      renderWithAppProviders(<TransactionGraph escrow={baseEscrow} />);
      const summary = screen.getByText(/view as table/i);
      fireEvent.click(summary);
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('From')).toBeInTheDocument();
      expect(screen.getByText('To')).toBeInTheDocument();
      expect(screen.getByText('Type')).toBeInTheDocument();
    });

    it('table rows match active edges for Active status', () => {
      renderWithAppProviders(<TransactionGraph escrow={baseEscrow} />);
      fireEvent.click(screen.getByText(/view as table/i));
      // Active has one edge: Buyer Wallet → Escrow Contract (Deposit)
      expect(screen.getByRole('table').textContent).toContain('Buyer Wallet');
      expect(screen.getByRole('table').textContent).toContain('Escrow Contract');
      expect(screen.getByRole('table').textContent).toContain('Deposit');
    });
  });

  describe('null / missing escrow', () => {
    it('renders without crashing when escrow is null', () => {
      expect(() => renderWithAppProviders(<TransactionGraph escrow={null} />)).not.toThrow();
    });

    it('does not show a popover when escrow is null and node is clicked', () => {
      renderWithAppProviders(<TransactionGraph escrow={null} />);
      const btn = screen.getByRole('button', { name: /buyer wallet/i });
      fireEvent.click(btn);
      // NodeDetail requires escrow to be truthy — no dialog rendered
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
