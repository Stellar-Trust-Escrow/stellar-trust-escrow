import { render, screen, fireEvent } from '@testing-library/react';
import NetworkIndicator from '../../../components/layout/NetworkIndicator';
import { I18nProvider } from '../../../i18n/index.jsx';

const renderIndicator = (props) =>
  render(
    <I18nProvider>
      <NetworkIndicator {...props} />
    </I18nProvider>,
  );

describe('NetworkIndicator', () => {
  it('renders Testnet label by default (null network)', () => {
    renderIndicator({ network: null, isConnected: false });
    expect(screen.getByText('Testnet')).toBeInTheDocument();
  });

  it('renders Testnet label when network is testnet', () => {
    renderIndicator({ network: 'testnet', isConnected: false });
    expect(screen.getByText('Testnet')).toBeInTheDocument();
  });

  it('renders Mainnet label when network is mainnet', () => {
    renderIndicator({ network: 'mainnet', isConnected: true });
    expect(screen.getByText('Mainnet')).toBeInTheDocument();
  });

  it('has accessible aria-label containing the network name', () => {
    renderIndicator({ network: 'testnet', isConnected: false });
    expect(screen.getByRole('button', { name: /Network: Testnet/i })).toBeInTheDocument();
  });

  it('shows details popover on click', () => {
    renderIndicator({ network: 'testnet', isConnected: false });
    fireEvent.click(screen.getByRole('button', { name: /Network:/i }));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('shows wallet disconnected state in popover', () => {
    renderIndicator({ network: 'testnet', isConnected: false });
    fireEvent.click(screen.getByRole('button', { name: /Network:/i }));
    expect(screen.getByText(/Wallet disconnected/i)).toBeInTheDocument();
  });

  it('shows wallet connected state in popover', () => {
    renderIndicator({ network: 'mainnet', isConnected: true });
    fireEvent.click(screen.getByRole('button', { name: /Network:/i }));
    expect(screen.getByText(/Wallet connected/i)).toBeInTheDocument();
  });

  it('toggles popover closed on second click', () => {
    renderIndicator({ network: 'testnet', isConnected: false });
    const btn = screen.getByRole('button', { name: /Network:/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('sets aria-expanded correctly', () => {
    renderIndicator({ network: 'testnet', isConnected: false });
    const btn = screen.getByRole('button', { name: /Network:/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });
});
