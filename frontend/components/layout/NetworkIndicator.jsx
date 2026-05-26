'use client';

import { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';

/**
 * NetworkIndicator
 *
 * Displays the current Stellar network (Testnet / Mainnet) as a colour-coded
 * pill in the header.  Click to toggle a small details popover.
 *
 * Props:
 *   network      — 'testnet' | 'mainnet' | null
 *   isConnected  — boolean
 */
export default function NetworkIndicator({ network, isConnected }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const isMainnet = network === 'mainnet';
  const label = isMainnet ? t('network.mainnet') : t('network.testnet');

  const pillStyles = isMainnet
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    : 'bg-amber-500/10 text-amber-400 border-amber-500/20';

  const dotStyles = isMainnet ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse';

  return (
    <div className="relative hidden sm:block">
      <button
        id="network-badge"
        aria-label={`Network: ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded-full transition-colors duration-300 cursor-pointer ${pillStyles}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dotStyles}`} />
        {label}
      </button>

      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-full mt-2 z-50 w-44 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 text-xs text-gray-300"
        >
          <p className="font-semibold text-white mb-1">{label}</p>
          <p className="text-gray-400">
            {isConnected ? '🟢 Wallet connected' : '⚪ Wallet disconnected'}
          </p>
          <p className="mt-1 text-gray-500">
            {isMainnet ? 'Stellar Public Network' : 'Stellar Testnet (Futurenet)'}
          </p>
        </div>
      )}
    </div>
  );
}
