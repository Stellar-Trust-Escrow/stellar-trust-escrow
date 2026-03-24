import { render, screen } from '@testing-library/react';
import Header from '../../../components/layout/Header';

describe('Header', () => {
  it('renders the brand name', () => {
    render(<Header />);
    expect(screen.getByText(/StellarTrust/)).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    render(<Header />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explorer' })).toBeInTheDocument();
  });

  it('renders Connect Wallet button when not connected', () => {
    render(<Header />);
    expect(screen.getByRole('button', { name: 'Connect Wallet' })).toBeInTheDocument();
  });

  it('renders Testnet badge', () => {
    render(<Header />);
    expect(screen.getByText('Testnet')).toBeInTheDocument();
  });

  it('logo links to home', () => {
    render(<Header />);
    const logoLink = screen.getAllByRole('link').find((l) => l.getAttribute('href') === '/');
    expect(logoLink).toBeInTheDocument();
  });
});
