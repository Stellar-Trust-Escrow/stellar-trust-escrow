import { render, screen } from '@testing-library/react';
import EscrowCard from '../../../components/escrow/EscrowCard';

const baseEscrow = {
  id: 1,
  title: 'Logo Design Project',
  status: 'Active',
  totalAmount: '500 USDC',
  milestoneProgress: '2 / 4',
  counterparty: 'GBXYZ...1234',
  role: 'client',
};

describe('EscrowCard', () => {
  it('renders escrow title', () => {
    render(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('Logo Design Project')).toBeInTheDocument();
  });

  it('renders total amount', () => {
    render(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('500 USDC')).toBeInTheDocument();
  });

  it('renders milestone progress', () => {
    render(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
  });

  it('renders counterparty address', () => {
    render(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('GBXYZ...1234')).toBeInTheDocument();
  });

  it('shows "Freelancer:" label for client role', () => {
    render(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText(/Freelancer:/)).toBeInTheDocument();
  });

  it('shows "Client:" label for freelancer role', () => {
    render(<EscrowCard escrow={{ ...baseEscrow, role: 'freelancer' }} />);
    expect(screen.getByText(/Client:/)).toBeInTheDocument();
  });

  it('links to the escrow detail page', () => {
    render(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/escrow/1');
  });

  it('renders the status badge', () => {
    render(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows "You are client" for client role', () => {
    render(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('You are client')).toBeInTheDocument();
  });

  it('shows "You are freelancer" for freelancer role', () => {
    render(<EscrowCard escrow={{ ...baseEscrow, role: 'freelancer' }} />);
    expect(screen.getByText('You are freelancer')).toBeInTheDocument();
  });

  it('renders progress bar with correct width', () => {
    const { container } = render(<EscrowCard escrow={baseEscrow} />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: '50%' });
  });

  it('renders 0% progress when milestoneProgress is 0 / 4', () => {
    const { container } = render(
      <EscrowCard escrow={{ ...baseEscrow, milestoneProgress: '0 / 4' }} />,
    );
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: '0%' });
  });
});
