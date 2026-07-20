/**
 * Header Component
 *
 * Persistent top navigation bar. Includes:
 * - Logo / brand name
 * - Nav links (Dashboard, Explorer)
 * - NetworkIndicator pill (Testnet / Mainnet)
 * - WalletStatus indicator (connected/connecting/disconnected)
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
import NetworkIndicator from './NetworkIndicator';
import { cn } from '../../lib/utils';

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

  return (
    <header
      className={cn(
        'border-b backdrop-blur-sm sticky top-0 z-50 transition-shadow duration-200',
        scrolled ? 'shadow-lg' : ''
      )}
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'var(--color-bg-surface)',
        boxShadow: scrolled ? '0 10px 15px -3px rgba(0, 0, 0, 0.1)' : 'none',
      }}
    >
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm"
              style={{
                backgroundColor: 'var(--color-brand)',
                color: 'white',
              }}
            >
              S
            </div>
            <span className="font-bold hidden sm:inline" style={{ color: 'var(--color-text-primary)' }}>
              StellarTrust<span style={{ color: 'var(--color-brand)' }}>Escrow</span>
            </span>
          </Link>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-sm transition-colors"
              style={{
                color: 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }}
            >
              {t('nav.dashboard')}
            </Link>
            <Link
              href="/explorer"
              className="text-sm transition-colors"
              style={{
                color: 'var(--color-text-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }}
            >
              {t('nav.explorer')}
            </Link>
            {/* TODO (contributor): add Leaderboard link */}
          </nav>

          {/* Right Side */}
          <div className="flex items-center gap-3">
            {/* Network Indicator */}
            <NetworkIndicator network={wallet.network} isConnected={wallet.isConnected} />

            {/* Wallet Status */}
            <WalletStatus wallet={wallet} />

            {/* Currency Selector */}
            <CurrencySelector size="sm" />

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-1 rounded transition-colors"
              aria-label="Open navigation menu"
              aria-expanded={isMobileMenuOpen}
              onClick={() => setIsMobileMenuOpen(true)}
              style={{
                color: 'var(--color-text-muted)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-muted)';
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Nav */}
        {isMobileMenuOpen && (
          <nav className="md:hidden py-4 border-t flex flex-col gap-4" style={{ borderColor: 'var(--color-border)' }}>
            <Link
              href="/dashboard"
              className="transition-colors px-2"
              style={{ color: 'var(--color-text-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {t('nav.dashboard')}
            </Link>
            <Link
              href="/explorer"
              className="transition-colors px-2"
              style={{ color: 'var(--color-text-secondary)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--color-text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--color-text-secondary)';
              }}
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {t('nav.explorer')}
            </Link>
          </nav>
        )}
      </div>

      <MobileDrawer isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
    </header>
  );
}
