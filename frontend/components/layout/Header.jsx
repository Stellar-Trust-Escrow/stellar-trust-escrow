/**
 * Header Component
 *
 * Persistent top navigation bar. Includes:
 * - Logo / brand name
 * - Nav links (Dashboard, Explorer)
 * - WalletStatus indicator (connected/connecting/disconnected)
 * - Network indicator pill (Testnet / Mainnet)
 *
 * TODO (contributor — medium, Issue #37):
 * - Add mobile hamburger menu
 * - Highlight active nav link
 */

/* eslint-disable no-undef */
'use client';

import Link from 'next/link';
import { useWallet } from '../../hooks/useWallet';
import WalletStatus from '../ui/WalletStatus';

export default function Header() {
  const wallet = useWallet();

  // Determine network label & style from wallet state
  const networkLabel = wallet.network === 'mainnet' ? 'Mainnet' : 'Testnet';
  const networkStyles =
    wallet.network === 'mainnet'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      : 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  const networkDotStyles =
    wallet.network === 'mainnet' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse';

  return (
    <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              S
            </div>
            <span className="font-bold text-white hidden sm:inline">
              StellarTrust<span className="text-indigo-400">Escrow</span>
            </span>
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/explorer"
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              Explorer
            </Link>
            {/* TODO (contributor): add Leaderboard link */}
          </nav>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            {/* Network Badge — shows real network when wallet is connected */}
            <span
              id="network-badge"
              className={`hidden sm:flex items-center gap-1.5 text-xs border px-2.5 py-1 rounded-full transition-colors duration-300 ${networkStyles}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${networkDotStyles}`} />
              {networkLabel}
            </span>

            {/* Wallet Status */}
            <WalletStatus wallet={wallet} />
          </div>
        </div>
      </div>
    </header>
  );
}
