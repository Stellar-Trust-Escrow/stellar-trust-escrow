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

'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { useI18n } from '../../i18n/index.jsx';
import WalletStatus from '../ui/WalletStatus';
import MobileDrawer from './MobileDrawer';
import ThemeToggle from './ThemeToggle';
import CurrencySelector from '../ui/CurrencySelector';

export default function Header() {
  const wallet = useWallet();
  const { t } = useI18n();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const networkLabel = wallet.network === 'mainnet' ? t('network.mainnet') : t('network.testnet');
  const networkStyles =
    wallet.network === 'mainnet'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
      : 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  const networkDotStyles =
    wallet.network === 'mainnet' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse';

  return (
    <header className={`border-b border-gray-200 bg-white/80 dark:border-gray-800 dark:bg-gray-950/80 backdrop-blur-sm sticky top-0 z-50 transition-shadow duration-200 ${scrolled ? 'shadow-lg shadow-black/20' : ''}`}>
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
              className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white text-sm transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/explorer"
              className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white text-sm transition-colors"
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

            {/* Hamburger — mobile only */}
            <button
              className="md:hidden text-gray-400 hover:text-white p-1 rounded transition-colors"
              aria-label="Open navigation menu"
              aria-expanded={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

            {/* Currency Selector */}
            <CurrencySelector size="sm" />

            {/* Theme Toggle */}
            <ThemeToggle />
          </div>
        </div>

        {/* Mobile Nav */}
        {isMobileMenuOpen && (
          <nav className="md:hidden py-4 border-t border-gray-200 dark:border-gray-800 flex flex-col gap-4">
            <Link
              href="/dashboard"
              className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors px-2"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Dashboard
            </Link>
            <Link
              href="/explorer"
              className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors px-2"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Explorer
            </Link>
          </nav>
        )}
      </div>

      <MobileDrawer isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
    </header>
  );
}
