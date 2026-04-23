import { screen } from '@testing-library/react';
import EscrowCard from '../../../components/escrow/EscrowCard';
import { renderWithAppProviders } from '../../test-utils';

const baseEscrow = {
  id: 1,
  title: 'Logo Design Project',
  status: 'Active',
  totalAmount: '5000000000',
  milestoneProgress: '2 / 4',
  counterparty: 'GBXYZ...1234',
  role: 'client',
};

describe('EscrowCard', () => {
  it('renders escrow title', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('Logo Design Project')).toBeInTheDocument();
  });

  it('renders total amount', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('$500.00')).toBeInTheDocument();
    expect(screen.getByText('500.00 USDC')).toBeInTheDocument();
  });

  it('renders milestone progress', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
  });

  it('renders counterparty address', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('GBXYZ...1234')).toBeInTheDocument();
  });

  it('shows "Freelancer:" label for client role', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText(/Freelancer:/)).toBeInTheDocument();
  });

  it('shows "Client:" label for freelancer role', () => {
    renderWithAppProviders(<EscrowCard escrow={{ ...baseEscrow, role: 'freelancer' }} />);
    expect(screen.getByText(/Client:/)).toBeInTheDocument();
  });

  it('links to the escrow detail page', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByRole('button', { name: /view details for escrow/i })).toHaveAttribute('href', '/escrow/1');
  });

  it('renders the status badge', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows "You are client" for client role', () => {
    renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    expect(screen.getByText('You are Client')).toBeInTheDocument();
  });

  it('shows "You are freelancer" for freelancer role', () => {
    renderWithAppProviders(<EscrowCard escrow={{ ...baseEscrow, role: 'freelancer' }} />);
    expect(screen.getByText('You are Freelancer')).toBeInTheDocument();
  });

  it('renders progress bar with correct width', () => {
    const { container } = renderWithAppProviders(<EscrowCard escrow={baseEscrow} />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: '50%' });
  });

  it('renders 0% progress when milestoneProgress is 0 / 4', () => {
    const { container } = renderWithAppProviders(
      <EscrowCard escrow={{ ...baseEscrow, milestoneProgress: '0 / 4' }} />,
    );
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: '0%' });
  });
});
