import { render } from '@testing-library/react';
import { ThemeProvider } from '../contexts/ThemeContext';
import { CurrencyProvider } from '../contexts/CurrencyContext';
import { ToastProvider } from '../contexts/ToastContext';
import { I18nProvider } from '../i18n/index.jsx';

function AppProviders({ children }) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <CurrencyProvider>
          <ToastProvider>{children}</ToastProvider>
        </CurrencyProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

export function renderWithAppProviders(ui) {
  window.localStorage.setItem(
    'ste_fx_rates',
    JSON.stringify({ rates: { USD: 1 }, fetchedAt: Date.now() }),
  );
  return render(ui, { wrapper: AppProviders });
}
