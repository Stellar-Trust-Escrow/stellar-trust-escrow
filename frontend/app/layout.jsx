/**
 * Root Layout
 *
 * Wraps all pages with global providers: WalletProvider, ThemeProvider, etc.
 * Also renders the persistent Header and Footer.
 *
 * Performance optimisations applied:
 * - Optimised font loading with next/font (no FOUT/FOIT)
 * - DNS prefetch + preconnect for API origin
 * - PerformanceMonitor for Core Web Vitals tracking
 * - Minimal critical CSS via Tailwind
 *
 * TODO (contributor — medium, Issue #30):
 * - Implement WalletProvider that manages Freighter connection state
 * - Add global toast/notification system
 * - Add loading skeleton for initial page hydration
 */

import './globals.css';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import PerformanceMonitor from '../components/ui/PerformanceMonitor';

// ── Optimised Font Loading ────────────────────────────────────────────────────
// next/font self-hosts the font files — zero layout shift, no external requests.

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  preload: false, // mono font is secondary — defer loading
});

// ── API origin for DNS prefetch ───────────────────────────────────────────────
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const metadata = {
  title: 'StellarTrustEscrow — Decentralized Milestone Escrow',
  description:
    'Trustless, milestone-based escrow with on-chain reputation on the Stellar blockchain.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://stellartrustescrow.com'),
  openGraph: {
    title: 'StellarTrustEscrow — Decentralized Milestone Escrow',
    description:
      'Trustless, milestone-based escrow with on-chain reputation on the Stellar blockchain.',
    type: 'website',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#030712',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* DNS prefetch + preconnect for API to reduce latency on first fetch */}
        <link rel="dns-prefetch" href={API_ORIGIN} />
        <link rel="preconnect" href={API_ORIGIN} crossOrigin="anonymous" />
      </head>
      <body className="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans">
        {/*
          TODO (contributor — Issue #30):
          Wrap with <WalletProvider> and <SWRConfig> here.
          Example:
          <WalletProvider>
            <SWRConfig value={{ fetcher: ... }}>
              {children}
            </SWRConfig>
          </WalletProvider>
        */}
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">{children}</main>
        <Footer />

        {/* Core Web Vitals monitoring — renders nothing to DOM */}
        <PerformanceMonitor />
      </body>
    </html>
  );
}
