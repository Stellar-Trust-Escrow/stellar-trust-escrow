'use client';

/**
 * WalletStatus Component
 *
 * Displays the current Freighter wallet connection state in the header:
 *
 * - Disconnected → "Connect Wallet" button
 * - Connecting   → spinner + "Connecting…" button
 * - Connected    → status badge (green dot) + truncated address with tooltip
 *                  showing the full address on hover + "Disconnect" button
 *
 * Props match the object returned by useWallet():
 *
 * @param {{ isConnected, isConnecting, isFreighterInstalled, address, network, connect, disconnect, error }} wallet
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from './Button';
import Modal from './Modal';
import Spinner from './Spinner';
import { truncateAddress } from '../../lib/truncateAddress';
import { useI18n } from '../../i18n/index.jsx';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Truncate a Stellar address to first 6 + last 4 chars.
 * e.g. GABCDEF...XY12
 */
function truncateAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ── Status Dot ────────────────────────────────────────────────────────────────

function StatusDot({ status }) {
  const styles = {
    connected: 'bg-emerald-400 shadow-[0_0_6px_1px_rgba(52,211,153,0.7)]',
    disconnected: 'bg-gray-500',
    connecting: 'bg-amber-400 animate-pulse',
  };
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 transition-colors duration-300 ${styles[status]}`}
      aria-label={`Wallet ${status}`}
    />
  );
}

// ── Address Tooltip ───────────────────────────────────────────────────────────

function AddressWithTooltip({ address }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative group">
      <button
        id="wallet-address-display"
        onClick={handleCopy}
        className="font-mono text-sm text-indigo-400 hover:text-indigo-300 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1"
        aria-label="Copy wallet address"
        title="Click to copy"
      >
        {truncateAddress(address)}
      </button>

      {/* Tooltip */}
      <div
        role="tooltip"
        className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50
                   invisible opacity-0 group-hover:visible group-hover:opacity-100
                   transition-all duration-150 pointer-events-none"
      >
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 shadow-xl whitespace-nowrap">
          <p className="text-xs text-gray-400 mb-1">Full address</p>
          <p className="font-mono text-xs text-white break-all">{address}</p>
          <p className="text-xs text-gray-500 mt-1">{copied ? '✅ Copied!' : 'Click to copy'}</p>
          {/* Arrow */}
          <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-gray-800 border-l border-t border-gray-700" />
        </div>
      </div>
    </div>
  );
}

// ── Not Installed Banner ──────────────────────────────────────────────────────

function FreighterNotInstalled() {
  return (
    <a
      href="https://freighter.app"
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-amber-400 border border-amber-500/30 bg-amber-500/10
                 px-3 py-1.5 rounded-lg hover:bg-amber-500/20 transition-colors"
    >
      Install Freighter ↗
    </a>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WalletStatus({ wallet }) {
  const { isConnected, isConnecting, isFreighterInstalled, address, connect, disconnect, error } =
    wallet;
  const { t } = useI18n();
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDisconnect = () => {
    disconnect();
    setShowConfirm(false);
    router.push('/');
  };

  // Not installed — prompt installation
  if (!isFreighterInstalled) {
    return (
      <div className="flex items-center gap-2">
        <StatusDot status="disconnected" />
        <FreighterNotInstalled />
      </div>
    );
  }

  // Connecting (loading state)
  if (isConnecting) {
    return (
      <div className="flex items-center gap-2">
        <StatusDot status="connecting" />
        <button
          disabled
          id="wallet-connecting-btn"
          className="inline-flex items-center gap-2 text-sm bg-gray-800 border border-gray-700
                     text-gray-400 px-3 py-1.5 rounded-lg opacity-80 cursor-not-allowed"
        >
          <Spinner className="w-3.5 h-3.5" />
          {t('wallet.connecting')}
        </button>
      </div>
    );
  }

  // Connected
  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <Avatar address={address} size="sm" className="rounded-full" />
        <AddressWithTooltip address={address} />
        <Button id="wallet-disconnect-btn" variant="secondary" size="sm" onClick={disconnect}>
          {t('wallet.disconnect')}
        </Button>
      </div>
    );
  }

  // Disconnected (default)
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <StatusDot status="disconnected" />
        <Button id="wallet-connect-btn" variant="primary" size="sm" onClick={connect}>
          {t('wallet.connect')}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-red-400 max-w-[200px] text-right truncate" title={error}>
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
