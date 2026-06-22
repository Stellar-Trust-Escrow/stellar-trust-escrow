import { render } from '@testing-library/react';
import { ThemeProvider } from '../contexts/ThemeContext';
import { CurrencyProvider } from '../contexts/CurrencyContext';
import { ToastProvider } from '../contexts/ToastContext';
import { I18nProvider } from '../i18n/index.jsx';
import { AppStoreProvider } from '../store/app-store';
import { APP_STORAGE_KEY } from '../store/state';

function AppProviders({ children }) {
  return (
    <AppStoreProvider>
      <I18nProvider>
        <ThemeProvider>
          <CurrencyProvider>
            <ToastProvider>{children}</ToastProvider>
          </CurrencyProvider>
        </ThemeProvider>
      </I18nProvider>
    </AppStoreProvider>
  );
}

export function renderWithAppProviders(ui, { wallet } = {}) {
  window.localStorage.setItem(
    'ste_fx_rates',
    JSON.stringify({ rates: { USD: 1 }, fetchedAt: Date.now() }),
  );

  if (wallet) {
    window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify({ wallet }));
  }

  return render(ui, { wrapper: AppProviders });
}
