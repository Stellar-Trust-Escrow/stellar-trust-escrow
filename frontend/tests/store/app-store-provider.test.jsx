import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithStore } from '../../store/test-utils';
import { useAdminStore, useWalletStore } from '../../store/app-store';

function StoreProbe() {
  const admin = useAdminStore();
  const wallet = useWalletStore();

  return (
    <div>
      <span data-testid="api-key">{admin.apiKey || 'empty'}</span>
      <span data-testid="wallet-address">{wallet.address || 'none'}</span>
      <span data-testid="freighter-installed">{String(wallet.isFreighterInstalled)}</span>
      <button onClick={() => admin.setApiKey('new-key')}>Set Admin</button>
      <button onClick={() => wallet.setFreighterInstalled(true)}>Set Freighter</button>
    </div>
  );
}

describe('AppStoreProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('hydrates persisted admin and wallet state', async () => {
    window.localStorage.setItem(
      'ste-app-store',
      JSON.stringify({
        admin: { apiKey: 'stored-key' },
        wallet: {
          address: 'GSTORED',
          isConnected: true,
          network: 'testnet',
          isFreighterInstalled: true,
        },
      }),
    );

    renderWithStore(<StoreProbe />);

    await waitFor(() => {
      expect(screen.getByTestId('api-key')).toHaveTextContent('stored-key');
      expect(screen.getByTestId('wallet-address')).toHaveTextContent('GSTORED');
      expect(screen.getByTestId('freighter-installed')).toHaveTextContent('true');
    });
  });

  it('persists store updates back to localStorage', async () => {
    renderWithStore(<StoreProbe />);

    fireEvent.click(screen.getByRole('button', { name: 'Set Admin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set Freighter' }));

    await waitFor(() => {
      const persisted = JSON.parse(window.localStorage.getItem('ste-app-store'));
      expect(persisted.admin.apiKey).toBe('new-key');
      expect(persisted.wallet.isFreighterInstalled).toBe(true);
    });
  });
});
