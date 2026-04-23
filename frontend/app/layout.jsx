import './globals.css';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import NavigationProgress from '../components/layout/NavigationProgress';
import { ThemeProvider } from '../contexts/ThemeContext';
import { CurrencyProvider } from '../contexts/CurrencyContext';
import { ToastProvider } from '../contexts/ToastContext';
import { I18nProvider } from '../i18n/index.jsx';
import ServiceWorkerRegistrar from '../components/ui/ServiceWorkerRegistrar';
import ErrorBoundary from '../components/error/ErrorBoundary';
import PerformanceMonitor from '../components/ui/PerformanceMonitor';
import BackToTop from '../components/ui/BackToTop';
import OfflineBanner from '../components/ui/OfflineBanner';

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
  themeColor: '#030712',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="dns-prefetch" href={API_ORIGIN} />
        <link rel="preconnect" href={API_ORIGIN} crossOrigin="anonymous" />
      </head>
      <body className="bg-gray-950 text-gray-100 min-h-screen flex flex-col font-sans">
        <I18nProvider>
          <ThemeProvider>
            <CurrencyProvider>
              <ToastProvider>
                <Header />
                <NavigationProgress />
                <OfflineBanner />
                <ErrorBoundary>
                  <main id="main-content" className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
                    {children}
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
      </body>
    </html>
  );
}
