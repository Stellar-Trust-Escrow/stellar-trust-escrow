import { render, screen } from '@testing-library/react';
import StatCard from '../../../components/ui/StatCard';

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Active Escrows" value={5} />);
    expect(screen.getByText('Active Escrows')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(<StatCard label="Total" value={10} icon="🔒" />);
    expect(screen.getByText('🔒')).toBeInTheDocument();
  });

  it('renders without icon', () => {
    const { container } = render(<StatCard label="Total" value={10} />);
    expect(container.querySelector('span')).not.toBeInTheDocument();
  });

  it('renders string value', () => {
    render(<StatCard label="Locked" value="4,250 USDC" />);
    expect(screen.getByText('4,250 USDC')).toBeInTheDocument();
  });
});
