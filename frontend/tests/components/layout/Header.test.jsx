import { screen, fireEvent } from '@testing-library/react';
import Header from '../../../components/layout/Header';
import { renderWithAppProviders } from '../../test-utils';

const renderHeader = () => renderWithAppProviders(<Header />);

describe('Header', () => {
  it('renders the brand name', () => {
    renderHeader();
    expect(screen.getAllByText(/StellarTrust/).length).toBeGreaterThan(0);
  });

  it('renders navigation links', () => {
    renderHeader();
    expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Explorer' }).length).toBeGreaterThan(0);
  });

  it('renders install link when Freighter is unavailable', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: 'Install Freighter ↗' })).toBeInTheDocument();
  });

  it('renders Testnet badge', () => {
    renderHeader();
    expect(screen.getByText('Testnet')).toBeInTheDocument();
  });

  it('logo links to home', () => {
    renderHeader();
    const logoLink = screen.getAllByRole('link').find((l) => l.getAttribute('href') === '/');
    expect(logoLink).toBeInTheDocument();
  });

  it('shows network details popover when badge is clicked', () => {
    renderHeader();
    const badge = screen.getByRole('button', { name: /Network:/i });
    fireEvent.click(badge);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('hides network details popover on second click', () => {
    renderHeader();
    const badge = screen.getByRole('button', { name: /Network:/i });
    fireEvent.click(badge);
    fireEvent.click(badge);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
