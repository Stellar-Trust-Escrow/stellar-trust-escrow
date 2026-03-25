/**
 * Root Layout
 *
 * Wraps all pages with global providers: WalletProvider, ThemeProvider, etc.
 * Also renders the persistent Header and Footer.
 *
 * TODO (contributor — medium, Issue #30):
 * - Implement WalletProvider that manages Freighter connection state
 * - Add global toast/notification system
 * - Add loading skeleton for initial page hydration
 */

import './globals.css';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import { I18nProvider } from '../i18n/index.jsx';
import LocaleHtmlAttributes from '../components/LocaleHtmlAttributes';

export const metadata = {
  title: 'StellarTrustEscrow — Decentralized Milestone Escrow',
  description:
    'Trustless, milestone-based escrow with on-chain reputation on the Stellar blockchain.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen flex flex-col">
        <I18nProvider>
          <LocaleHtmlAttributes />
          <Header />
          <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">{children}</main>
          <Footer />
        </I18nProvider>
      </body>
    </html>
  );
}
