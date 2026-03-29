import { render, screen, fireEvent } from '@testing-library/react';
import Header from '../../../components/layout/Header';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { I18nProvider } from '../../../i18n/index.jsx';

const renderHeader = () =>
  render(
    <I18nProvider>
      <ThemeProvider>
        <Header />
      </ThemeProvider>
    </I18nProvider>,
  );

describe('Header', () => {
  it('renders the brand name', () => {
    renderHeader();
    expect(screen.getByText(/StellarTrust/)).toBeInTheDocument();
  });

  it('renders navigation links', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Explorer' })).toBeInTheDocument();
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
