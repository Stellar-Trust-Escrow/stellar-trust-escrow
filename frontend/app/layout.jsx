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
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import NavigationProgress from '../components/layout/NavigationProgress';
import { ThemeProvider } from '../contexts/ThemeContext';
import { CurrencyProvider } from '../contexts/CurrencyContext';
import { ToastProvider } from '../contexts/ToastContext';
import ServiceWorkerRegistrar from '../components/ServiceWorkerRegistrar';
import ErrorBoundary from '../components/error/ErrorBoundary';
import PerformanceMonitor from '../components/performance/PerformanceMonitor';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

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
    <html lang="en">
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
        <NavigationProgress />
        <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">{children}</main>
        <Footer />
        <ThemeProvider>
          <CurrencyProvider>
            <ToastProvider>
              <Header />
              <ErrorBoundary>
                <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">{children}</main>
              </ErrorBoundary>
              <Footer />
            </ToastProvider>
          </CurrencyProvider>
        </ThemeProvider>

        {/* Core Web Vitals monitoring — renders nothing to DOM */}
        <PerformanceMonitor />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}