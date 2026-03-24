import { render, screen } from '@testing-library/react';
import DashboardPage from '../../app/dashboard/page';

describe('DashboardPage', () => {
  it('renders page heading', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders stat cards', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Active Escrows')).toBeInTheDocument();
    expect(screen.getByText('Total Locked')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders placeholder stats values', () => {
    render(<DashboardPage />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4,250 USDC')).toBeInTheDocument();
  });

  it('renders active escrows section', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Your Active Escrows')).toBeInTheDocument();
  });

  it('renders escrow cards', () => {
    render(<DashboardPage />);
    expect(screen.getByText('Logo Design Project')).toBeInTheDocument();
    expect(screen.getByText('Smart Contract Audit')).toBeInTheDocument();
  });

  it('renders New Escrow button', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('link', { name: '+ New Escrow' })).toBeInTheDocument();
  });

  it('renders reputation badge', () => {
    render(<DashboardPage />);
    expect(screen.getByText('87')).toBeInTheDocument();
  });
});
