'use client';

/**
 * @file WalletConnectButton.jsx
 *
 * A self-contained button that manages the full wallet connect / disconnect
 * lifecycle for Freighter and Ledger wallets.
 *
 * Usage:
 *   import WalletConnectButton from '@/components/WalletConnectButton';
 *   <WalletConnectButton />
 *
 * Named exports for consumers that want only part of the UI:
 *   import { ConnectTrigger, DisconnectTrigger } from '@/components/WalletConnectButton';
 */

import { useState, useCallback } from 'react';
import Button from './ui/Button';
import Spinner from './ui/Spinner';
import WalletConnectModal from './wallet/WalletConnectModal';
import { truncateAddress } from '../lib/truncateAddress';
import { useI18n } from '../i18n/index.jsx';
import { useWallet } from '../hooks/useWallet';

// ── ConnectTrigger ─────────────────────────────────────────────────────────

/**
 * A button that opens the wallet-connection modal when clicked.
 *
 * Renders a disabled, loading state while `isConnecting` is true so the user
 * cannot trigger a second connection attempt mid-flight.
 *
 * @param {object}   props
 * @param {boolean}  props.isConnecting   - Whether a connection attempt is in progress.
 * @param {Function} props.onClick        - Called when the user clicks the button.
 * @param {string}   [props.className]    - Optional extra Tailwind classes.
 * @returns {JSX.Element}
 */
export function ConnectTrigger({ isConnecting, onClick, className }) {
  const { t } = useI18n();

  if (isConnecting) {
    return (
      <button
        type="button"
        disabled
        aria-busy="true"
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg
                    bg-gray-800 border border-gray-700 text-gray-400 opacity-80 cursor-not-allowed
                    ${className ?? ''}`}
      >
        <Spinner className="w-3.5 h-3.5" />
        {t('wallet.connecting')}
      </button>
    );
  }

  return (
    <Button
      variant="primary"
      size="sm"
      onClick={onClick}
      className={className}
      data-tour="connect-wallet"
    >
      {t('wallet.connect')}
    </Button>
  );
}

// ── DisconnectTrigger ──────────────────────────────────────────────────────

/**
 * A button that displays the truncated wallet address and disconnects on click.
 *
 * Shows the full address in the `title` attribute for accessibility / hover
 * tooltips without cluttering the UI.
 *
 * @param {object}   props
 * @param {string}   props.address      - Connected Stellar public key.
 * @param {Function} props.onDisconnect - Called when the user clicks disconnect.
 * @param {string}   [props.className]  - Optional extra Tailwind classes.
 * @returns {JSX.Element}
 */
export function DisconnectTrigger({ address, onDisconnect, className }) {
  const { t } = useI18n();

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      {/* Truncated address badge */}
      <span
        className="font-mono text-sm text-indigo-400 px-2 py-1 rounded border border-indigo-500/30 bg-indigo-500/10"
        title={address}
        aria-label={`Connected wallet: ${address}`}
      >
        {truncateAddress(address)}
      </span>

      <Button variant="secondary" size="sm" onClick={onDisconnect}>
        {t('wallet.disconnect')}
      </Button>
    </div>
  );
}

// ── WalletConnectButton ────────────────────────────────────────────────────

/**
 * Composite wallet button that handles the full connect / disconnect flow.
 *
 * - Disconnected  → renders a "Connect Wallet" button.
 * - Connecting    → renders a disabled loading state.
 * - Connected     → renders the truncated address + a "Disconnect" button.
 *
 * Internally controls the {@link WalletConnectModal} lifecycle. The modal
 * delegates actual wallet communication to `useWallet()`.
 *
 * No props are required; the component reads wallet state from the global
 * store via `useWallet()`.
 *
 * @param {object}  [props]
 * @param {string}  [props.className]  - Optional extra Tailwind classes applied
 *                                       to the outermost wrapper element.
 * @returns {JSX.Element}
 */
export default function WalletConnectButton({ className }) {
  const { isConnected, isConnecting, address, connect, disconnect, error } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);

  /** Derives the WalletConnectModal `status` prop from hook state. */
  const modalStatus = isConnecting ? 'connecting' : isConnected ? 'connected' : 'disconnected';

  /**
   * Opens the connection modal.
   *
   * Called when the user clicks the "Connect Wallet" trigger button.
   *
   * @returns {void}
   */
  const handleOpenModal = useCallback(() => {
    setModalOpen(true);
  }, []);

  /**
   * Closes the connection modal.
   *
   * Called when the user dismisses the modal via the close button or
   * pressing Escape.
   *
   * @returns {void}
   */
  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  /**
   * Initiates a wallet connection for the given wallet kind and closes the
   * modal once the handshake is underway.
   *
   * Delegates to `useWallet().connect()`, which calls Freighter's
   * `requestAccess()` or the Ledger flow depending on `kind`.
   *
   * @param {'freighter'|'ledger'} _kind - The wallet type selected by the user
   *                                       inside the modal. Currently unused
   *                                       because `useWallet` auto-detects the
   *                                       wallet; reserved for future multi-wallet
   *                                       support.
   * @returns {Promise<void>}
   */
  const handleConnect = useCallback(
    async (_kind) => {
      await connect();
      // Close the modal only on successful connection; leave it open (with
      // error state) so the user can see the failure message.
      if (!error) setModalOpen(false);
    },
    [connect, error],
  );

  /**
   * Disconnects the active wallet session and closes the modal if open.
   *
   * Freighter does not expose a disconnect API, so this only clears local
   * state held by the wallet store.
   *
   * @returns {void}
   */
  const handleDisconnect = useCallback(() => {
    disconnect();
    setModalOpen(false);
  }, [disconnect]);

  return (
    <div className={className}>
      {/* ── Trigger button ─────────────────────────────────────────────── */}
      {isConnected && address ? (
        <DisconnectTrigger address={address} onDisconnect={handleDisconnect} />
      ) : (
        <ConnectTrigger isConnecting={isConnecting} onClick={handleOpenModal} />
      )}

      {/* ── Inline error (outside the modal, e.g. after modal was closed) */}
      {!isConnected && !isConnecting && error && (
        <p
          role="alert"
          className="mt-1 text-xs text-red-400 max-w-[220px] truncate text-right"
          title={error}
        >
          ⚠️ {error}
        </p>
      )}

      {/* ── Connection modal ────────────────────────────────────────────── */}
      <WalletConnectModal
        open={modalOpen}
        status={modalStatus}
        address={address}
        error={error}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onClose={handleCloseModal}
      />
    </div>
  );
}
