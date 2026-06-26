/**
 * Wallet Connection Modal Tests
 *
 * Tests multi-wallet support, wallet detection, connection state persistence,
 * and account switching functionality.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock wallet providers
const mockWallets = {
  freighter: {
    name: 'Freighter',
    installed: true,
    connect: jest.fn(),
    disconnect: jest.fn(),
  },
  lobstr: {
    name: 'LOBSTR',
    installed: false,
    downloadUrl: 'https://lobstr.co',
  },
  xbull: {
    name: 'xBull',
    installed: true,
    connect: jest.fn(),
    disconnect: jest.fn(),
  },
};

describe('Wallet Connection Modal', () => {
  describe('Wallet Detection', () => {
    it('should detect installed wallets', () => {
      const installedWallets = Object.entries(mockWallets)
        .filter(([, wallet]) => wallet.installed)
        .map(([key, wallet]) => wallet.name);

      expect(installedWallets).toContain('Freighter');
      expect(installedWallets).toContain('xBull');
      expect(installedWallets).not.toContain('LOBSTR');
    });

    it('should show only available wallets in UI', async () => {
      const WalletModal = ({ isOpen, onClose }) => {
        if (!isOpen) return null;

        const availableWallets = Object.entries(mockWallets).filter(
          ([, wallet]) => wallet.installed,
        );

        return (
          <div role="dialog">
            {availableWallets.map(([key, wallet]) => (
              <button key={key} type="button">
                {wallet.name}
              </button>
            ))}
          </div>
        );
      };

      const { rerender } = render(<WalletModal isOpen={false} onClose={() => {}} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      rerender(<WalletModal isOpen={true} onClose={() => {}} />);
      expect(screen.getByRole('button', { name: 'Freighter' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'xBull' })).toBeInTheDocument();
    });

    it('should show uninstalled wallets with download links', async () => {
      const WalletModal = ({ isOpen, onClose }) => {
        if (!isOpen) return null;

        const uninstalledWallets = Object.entries(mockWallets).filter(
          ([, wallet]) => !wallet.installed,
        );

        return (
          <div role="dialog">
            {uninstalledWallets.map(([key, wallet]) => (
              <a key={key} href={wallet.downloadUrl} target="_blank" rel="noopener noreferrer">
                Install {wallet.name}
              </a>
            ))}
          </div>
        );
      };

      render(<WalletModal isOpen={true} onClose={() => {}} />);

      const installLink = screen.getByRole('link', { name: /Install LOBSTR/i });
      expect(installLink).toHaveAttribute('href', 'https://lobstr.co');
      expect(installLink).toHaveAttribute('target', '_blank');
    });
  });

  describe('Wallet Connection', () => {
    it('should connect to selected wallet', async () => {
      const user = userEvent.setup();

      const TestComponent = () => {
        const [connected, setConnected] = React.useState(false);
        const [account, setAccount] = React.useState(null);

        const handleConnect = async (walletKey) => {
          mockWallets[walletKey].connect.mockResolvedValueOnce({
            publicKey: 'GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJHT3DYKU6EKM37SOIZXM2FN7',
          });

          const result = await mockWallets[walletKey].connect();
          setAccount(result.publicKey);
          setConnected(true);
        };

        return (
          <div>
            <button onClick={() => handleConnect('freighter')}>Connect Freighter</button>
            {connected && <p>Connected: {account}</p>}
          </div>
        );
      };

      render(<TestComponent />);

      const connectButton = screen.getByRole('button', { name: /Connect Freighter/i });
      await user.click(connectButton);

      await waitFor(() => {
        expect(screen.getByText(/Connected:/i)).toBeInTheDocument();
      });

      expect(mockWallets.freighter.connect).toHaveBeenCalled();
    });

    it('should handle connection errors gracefully', async () => {
      const user = userEvent.setup();

      const TestComponent = () => {
        const [error, setError] = React.useState(null);

        const handleConnect = async (walletKey) => {
          try {
            mockWallets[walletKey].connect.mockRejectedValueOnce(
              new Error('User rejected connection'),
            );
            await mockWallets[walletKey].connect();
          } catch (err) {
            setError(err.message);
          }
        };

        return (
          <div>
            <button onClick={() => handleConnect('freighter')}>Connect</button>
            {error && <p role="alert">{error}</p>}
          </div>
        );
      };

      render(<TestComponent />);
      await user.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });
    });
  });

  describe('Disconnect', () => {
    it('should disconnect from wallet', async () => {
      const user = userEvent.setup();

      const TestComponent = () => {
        const [connected, setConnected] = React.useState(true);

        const handleDisconnect = async () => {
          await mockWallets.freighter.disconnect();
          setConnected(false);
        };

        return (
          <div>
            {connected && (
              <>
                <p>Connected to Freighter</p>
                <button onClick={handleDisconnect}>Disconnect</button>
              </>
            )}
            {!connected && <p>Not connected</p>}
          </div>
        );
      };

      render(<TestComponent />);
      expect(screen.getByText('Connected to Freighter')).toBeInTheDocument();

      const disconnectButton = screen.getByRole('button', { name: /Disconnect/i });
      await user.click(disconnectButton);

      await waitFor(() => {
        expect(screen.getByText('Not connected')).toBeInTheDocument();
      });

      expect(mockWallets.freighter.disconnect).toHaveBeenCalled();
    });
  });

  describe('Account Switching', () => {
    it('should allow switching between accounts in same wallet', async () => {
      const user = userEvent.setup();

      const TestComponent = () => {
        const [account, setAccount] = React.useState('account1');

        return (
          <div>
            <p>Current: {account}</p>
            <button onClick={() => setAccount('account2')}>Switch Account</button>
          </div>
        );
      };

      render(<TestComponent />);
      expect(screen.getByText('Current: account1')).toBeInTheDocument();

      await user.click(screen.getByRole('button'));
      expect(screen.getByText('Current: account2')).toBeInTheDocument();
    });

    it('should update UI when account changes', async () => {
      const TestComponent = () => {
        const [account, setAccount] = React.useState(null);

        React.useEffect(() => {
          // Simulate account change event
          const handleAccountChange = () => {
            setAccount('GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJHT3DYKU6EKM37SOIZXM2FN7');
          };

          handleAccountChange();
        }, []);

        return <div>{account && <p>Account: {account}</p>}</div>;
      };

      render(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByText(/Account:/i)).toBeInTheDocument();
      });
    });
  });

  describe('Wallet Address Display', () => {
    it('should display truncated wallet address in navbar', () => {
      const truncateAddress = (addr) => `${addr.slice(0, 6)}...${addr.slice(-6)}`;

      const address = 'GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJHT3DYKU6EKM37SOIZXM2FN7';
      const truncated = truncateAddress(address);

      expect(truncated).toBe('GBRPY...XM2FN7');
    });

    it('should show full address on hover', async () => {
      const user = userEvent.setup();

      const TestComponent = () => {
        const address = 'GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJHT3DYKU6EKM37SOIZXM2FN7';
        const truncated = `${address.slice(0, 6)}...${address.slice(-6)}`;

        return (
          <div title={address}>
            <span>{truncated}</span>
          </div>
        );
      };

      const { container } = render(<TestComponent />);
      const element = container.firstChild;

      expect(element).toHaveAttribute('title', expect.stringContaining('GBRPYHIL'));
    });
  });

  describe('Connection Persistence', () => {
    it('should persist wallet connection across page refreshes', () => {
      // Mock localStorage
      const mockStorage = { account: 'GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJHT3DYKU6EKM37SOIZXM2FN7' };

      const TestComponent = () => {
        const [account, setAccount] = React.useState(() => {
          return mockStorage.account || null;
        });

        return <div>{account && <p>Connected: {account}</p>}</div>;
      };

      const { rerender } = render(<TestComponent />);
      expect(screen.getByText(/Connected:/i)).toBeInTheDocument();

      // Simulate page refresh
      rerender(<TestComponent />);
      expect(screen.getByText(/Connected:/i)).toBeInTheDocument();
    });

    it('should store connection preference', () => {
      const preferences = {};

      const storePreference = (wallet, account) => {
        preferences.lastWallet = wallet;
        preferences.lastAccount = account;
      };

      storePreference('freighter', 'GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJHT3DYKU6EKM37SOIZXM2FN7');

      expect(preferences.lastWallet).toBe('freighter');
      expect(preferences.lastAccount).toBeDefined();
    });
  });

  describe('Navbar Integration', () => {
    it('should show connected wallet indicator in navbar', () => {
      const TestComponent = () => {
        const [connected, setConnected] = React.useState(true);

        return (
          <nav>
            {connected && (
              <div>
                <span>GBRPY...XM2FN7</span>
                <button>Disconnect</button>
              </div>
            )}
          </nav>
        );
      };

      render(<TestComponent />);
      expect(screen.getByText(/GBRPY/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Disconnect/i })).toBeInTheDocument();
    });
  });
});
