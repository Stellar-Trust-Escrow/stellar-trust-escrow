import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import ExplorerPage from '../../app/explorer/page';
import { ThemeProvider } from '../../contexts/ThemeContext';
import { CurrencyProvider } from '../../contexts/CurrencyContext';
import { ToastProvider } from '../../contexts/ToastContext';
import { I18nProvider } from '../../i18n/index.jsx';
import { AppStoreProvider } from '../../store/app-store';

// EscrowListItem renders the real EscrowCard; mock it (as the main explorer
// test does) so list cards don't clash with compare-panel column headers.
jest.mock(
  '../../components/escrow/EscrowCard',
  () =>
    function EscrowCard({ escrow }) {
      return <div data-testid="escrow-card">Escrow #{escrow.id}</div>;
    },
);

// Wrap with both the app providers (I18n/Toast/…) and the nuqs testing adapter
// so URL state (compare=…) persists inside a single render tree.
function AppProviders({ children }) {
  window.localStorage.setItem(
    'ste_fx_rates',
    JSON.stringify({ rates: { USD: 1 }, fetchedAt: Date.now() }),
  );
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

function renderWithProviders(ui, searchParams = '') {
  const NuqsWrapper = withNuqsTestingAdapter({ searchParams, hasMemory: true });
  return render(ui, {
    wrapper: ({ children }) => (
      <NuqsWrapper>
        <AppProviders>{children}</AppProviders>
      </NuqsWrapper>
    ),
  });
}

const mockEscrows = [
  { id: 1, status: 'Active', totalAmount: '1000', clientAddress: 'GCLIENT1' },
  { id: 2, status: 'Active', totalAmount: '2000', clientAddress: 'GCLIENT2' },
  { id: 3, status: 'Completed', totalAmount: '500', clientAddress: 'GCLIENT3' },
  { id: 4, status: 'Active', totalAmount: '3000', clientAddress: 'GCLIENT4' },
];

global.fetch = jest.fn((url) => {
  let data = [...mockEscrows];
  if (url.includes('status=Completed')) data = data.filter((e) => e.status === 'Completed');
  return Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        data,
        total: data.length,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      }),
  });
});

describe('ExplorerPage — compare mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('shows a Compare toggle button', async () => {
    renderWithProviders(<ExplorerPage />);
    expect(await screen.findByRole('button', { name: /Compare/ })).toBeInTheDocument();
  });

  it('shows checkboxes on escrow cards after enabling compare mode', async () => {
    renderWithProviders(<ExplorerPage />);
    await screen.findByText('Escrow #1');
    fireEvent.click(screen.getByRole('button', { name: /Compare/ }));

    await waitFor(() => {
      expect(screen.getByTestId('compare-check-1')).toBeInTheDocument();
      expect(screen.getByTestId('compare-check-2')).toBeInTheDocument();
    });
  });

  it('selecting escrows renders the comparison panel', async () => {
    renderWithProviders(<ExplorerPage />);
    await screen.findAllByTestId('escrow-card');
    fireEvent.click(screen.getByRole('button', { name: /Compare/ }));

    fireEvent.click(await screen.findByTestId('compare-check-1'));
    await waitFor(() => {
      expect(screen.getByTestId('compare-colheader-1')).toBeInTheDocument();
    });

    fireEvent.click(await screen.findByTestId('compare-check-2'));
    await waitFor(() => {
      expect(screen.getByTestId('compare-colheader-2')).toBeInTheDocument();
      expect(screen.getByTestId('compare-panel')).toBeInTheDocument();
    });
  });

  it('pre-populates the comparison from a ?compare= URL', async () => {
    renderWithProviders(<ExplorerPage />, 'compare=1,2');
    await waitFor(() => {
      expect(screen.getByTestId('compare-panel')).toBeInTheDocument();
    });
  });

  it('shows the comparison panel when all 4 slots are used via URL', async () => {
    renderWithProviders(<ExplorerPage />, 'compare=1,2,3,4');
    await waitFor(() => {
      // compareMode initialises from URL so the panel shows without toggling
      expect(screen.getByTestId('compare-colheader-1')).toBeInTheDocument();
      expect(screen.getByTestId('compare-colheader-4')).toBeInTheDocument();
      expect(screen.getByTestId('compare-panel')).toBeInTheDocument();
    });
  });
});
