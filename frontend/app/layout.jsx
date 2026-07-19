import './globals.css';
import { Suspense } from 'react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import '../styles/theme.css';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import NavigationProgress from '../components/layout/NavigationProgress';
import { ThemeProvider } from '../contexts/ThemeContext';
import { CurrencyProvider } from '../contexts/CurrencyContext';
import { ToastProvider } from '../contexts/ToastContext';
import { I18nProvider } from '../i18n/index.jsx';
import ErrorBoundary from '../components/error/ErrorBoundary';
import PerformanceMonitor from '../components/ui/PerformanceMonitor';
import BackToTop from '../components/ui/BackToTop';
import OfflineBanner from '../components/ui/OfflineBanner';
import ServiceWorkerRegistrar from '../components/ui/ServiceWorkerRegistrar';
import { AppStoreProvider } from '../store/app-store';
import TokenRefreshManager from '../components/auth/TokenRefreshManager';

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const metadata = {
  title: 'StellarTrustEscrow — Decentralized Milestone Escrow',
  description:
    'Trustless, milestone-based escrow with on-chain reputation on the Stellar blockchain.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://stellartrustescrow.com'),
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: { light: '#ffffff', dark: '#0f172a' },
};

// Anti-FOUC script to set theme before React hydration
const AntiFoucScript = () => (
  <script
    dangerouslySetInnerHTML={{
      __html: `
        (function() {
          const stored = localStorage.getItem('theme');
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          const theme = stored || (prefersDark ? 'dark' : 'light');
          document.documentElement.setAttribute('data-theme', theme);
          document.documentElement.classList.add('no-transitions');
        })();
      `,
    }}
  />
);

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <AntiFoucScript />
        <link rel="dns-prefetch" href={API_ORIGIN} />
        <link rel="preconnect" href={API_ORIGIN} crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen flex flex-col font-sans">
        <AppStoreProvider>
          <I18nProvider>
            <ThemeProvider>
              <CurrencyProvider>
                <ToastProvider>
                  <TokenRefreshManager />
                  <Header />
                  <NavigationProgress />
                  <OfflineBanner />
                  <ErrorBoundary>
                    <main
                      id="main-content"
                      className="flex-1 container mx-auto px-4 py-8 max-w-7xl"
                    >
                      <Suspense>
                        <NuqsAdapter>{children}</NuqsAdapter>
                      </Suspense>
                    </main>
                  </ErrorBoundary>
                  <Footer />
                  <PerformanceMonitor />
                  <BackToTop />
                  <ServiceWorkerRegistrar />
                </ToastProvider>
              </CurrencyProvider>
            </ThemeProvider>
          </I18nProvider>
        </AppStoreProvider>
      </body>
    </html>
  );
}
