import { render, screen } from '@testing-library/react';
import Header from '../../../components/layout/Header';
import { ThemeProvider } from '../../../contexts/ThemeContext';

const renderWithTheme = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('Header', () => {
  it('renders the brand name', () => {
    renderWithTheme(<Header />);
    expect(screen.getByText(/StellarTrust/)).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    renderWithTheme(<Header />);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explorer' })).toBeInTheDocument();
  });

  it('renders install link when Freighter is unavailable', () => {
    renderWithTheme(<Header />);
    expect(screen.getByRole('link', { name: 'Install Freighter ↗' })).toBeInTheDocument();
  });

  it('renders Testnet badge', () => {
    renderWithTheme(<Header />);
    expect(screen.getByText('Testnet')).toBeInTheDocument();
  });

  it('logo links to home', () => {
    renderWithTheme(<Header />);
    const logoLink = screen.getAllByRole('link').find((l) => l.getAttribute('href') === '/');
    expect(logoLink).toBeInTheDocument();
  });
});
