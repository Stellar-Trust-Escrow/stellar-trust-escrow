/**
 * Header Component
 *
 * Persistent top navigation bar. Includes:
 * - Logo / brand name
 * - Nav links (Dashboard, Explorer)
 * - Wallet connect / disconnect button
 * - Network indicator pill
 *
 * TODO (contributor — medium, Issue #37):
 * - Implement useWallet() hook (Freighter integration)
 * - Show truncated address when connected
 * - Show network badge (Testnet / Mainnet)
 * - Add mobile hamburger menu
 * - Highlight active nav link
 */

 
'use client';

import Link from 'next/link';
import Button from '../ui/Button';

// TODO (contributor — Issue #37): replace with real wallet state
const PLACEHOLDER_WALLET = {
  isConnected: false,
  address: null,
  network: 'testnet',
};

export default function Header() {
  const wallet = PLACEHOLDER_WALLET;

  const handleConnect = async () => {
    // TODO (contributor — Issue #37):
    // 1. Check if Freighter is installed (window.freighter)
    // 2. Call freighter.requestAccess()
    // 3. Get public key: freighter.getPublicKey()
    // 4. Store in wallet context
    console.log('TODO: connect Freighter — see Issue #37');
  };

  const handleDisconnect = () => {
    // TODO (contributor — Issue #37)
    console.log('TODO: disconnect wallet');
  };

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
            {/* Network Badge */}
            {/*
              TODO (contributor — Issue #37):
              Show real network from wallet context.
              Style differently for mainnet (green) vs testnet (amber).
            */}
            <span className="hidden sm:flex items-center gap-1.5 text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Testnet
            </span>

            {/* Wallet Button */}
            {wallet.isConnected ? (
              <div className="flex items-center gap-2">
                <Link
                  href={`/profile/${wallet.address}`}
                  className="text-sm font-mono text-indigo-400 hover:text-indigo-300 hidden sm:block"
                >
                  {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
                </Link>
                <Button variant="secondary" size="sm" onClick={handleDisconnect}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button variant="primary" size="sm" onClick={handleConnect}>
                Connect Wallet
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
