import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import ExplorerPage from '../../app/explorer/page';

// hasMemory: true so URL state persists across nuqs setter calls inside the same render tree.
// Without it the adapter discards each update and the second fetch reverts to the initial URL.
const NuqsWrapper = withNuqsTestingAdapter({ hasMemory: true });
function renderWithNuqs(ui) {
  return render(ui, { wrapper: NuqsWrapper });
}

// SearchFilters uses useToast which requires ToastProvider — stub it for tests.
jest.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

// EscrowCard uses useI18n which requires I18nProvider — mock it for tests.
jest.mock(
  '../../components/escrow/EscrowCard',
  () =>
    function EscrowCard({ escrow }) {
      return <div data-testid="escrow-card">Escrow #{escrow.id}</div>;
    },
);

const mockEscrows = [
  { id: 1, status: 'Active', totalAmount: '1000', clientAddress: '0x1A2B' },
  { id: 2, status: 'Active', totalAmount: '2000', clientAddress: '0x3C4D' },
  { id: 3, status: 'Completed', totalAmount: '500', clientAddress: '0x5E6F' },
  { id: 4, status: 'Active', totalAmount: '3000', clientAddress: '0x7A8B' },
];

global.fetch = jest.fn((url) => {
  let data = [...mockEscrows];
  if (url.includes('status=Completed')) {
    data = data.filter((e) => e.status === 'Completed');
  } else if (url.includes('status=Cancelled')) {
    data = data.filter((e) => e.status === 'Cancelled');
  } else if (url.includes('search=')) {
    // For test simplicity, we simulate search filtering if search term matches "2" (since id 2)
    if (url.includes('search=2')) {
      data = data.filter((e) => String(e.id) === '2');
    } else {
      data = [];
    }
  }

  return Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        data,
        total: data.length,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      }),
  });
});

describe('ExplorerPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders page heading', async () => {
    renderWithNuqs(<ExplorerPage />);
    expect(await screen.findByRole('heading', { name: 'Escrow Explorer' })).toBeInTheDocument();
  });

  it('renders search input', async () => {
    renderWithNuqs(<ExplorerPage />);
    expect(await screen.findByPlaceholderText(/Search by/)).toBeInTheDocument();
  });

  it('renders status filter buttons', async () => {
    renderWithNuqs(<ExplorerPage />);
    expect(await screen.findByText('Filters')).toBeInTheDocument();
  });

  it('renders fetched escrows by default', async () => {
    renderWithNuqs(<ExplorerPage />);
    expect(await screen.findByText('Escrow #1')).toBeInTheDocument();
    expect(screen.getByText('Escrow #2')).toBeInTheDocument();
    expect(screen.getByText('Escrow #3')).toBeInTheDocument();
    expect(screen.getByText('Escrow #4')).toBeInTheDocument();
  });

  it('filters escrows by status', async () => {
    renderWithNuqs(<ExplorerPage />);
    // Wait for initial render
    await screen.findByText('Escrow #1');
    fireEvent.click(screen.getByText('Filters'));

    // Click Completed filter
    const completedBtn = await screen.findByRole('button', { name: 'Completed' });
    fireEvent.click(completedBtn);

    // Wait for filter to settle: Escrow #1 gone, Escrow #3 visible
    await waitFor(() => {
      expect(screen.queryByText('Escrow #1')).not.toBeInTheDocument();
      expect(screen.getByText('Escrow #3')).toBeInTheDocument();
    });
  });

  it('filters escrows by search query', async () => {
    renderWithNuqs(<ExplorerPage />);
    await screen.findByText('Escrow #1'); // wait for initial render

    const searchInput = await screen.findByPlaceholderText(/Search by/);

    fireEvent.change(searchInput, { target: { value: '2' } });

    await waitFor(() => {
      expect(screen.queryByText('Escrow #1')).not.toBeInTheDocument();
    });
    // expect(screen.getByText('Escrow #2')).toBeInTheDocument();
  });

  it('shows empty state when no escrows match filter', async () => {
    renderWithNuqs(<ExplorerPage />);
    await screen.findByText('Escrow #1');

    fireEvent.click(screen.getByText('Filters'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelled' }));

    expect(await screen.findByText(/No escrows found/)).toBeInTheDocument();
  });

  it('renders stats bar', async () => {
    renderWithNuqs(<ExplorerPage />);
    expect(await screen.findByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('renders pagination buttons', async () => {
    renderWithNuqs(<ExplorerPage />);
    expect(await screen.findByRole('button', { name: /Prev/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/ })).toBeInTheDocument();
  });

  it('Prev button is disabled on first page', async () => {
    renderWithNuqs(<ExplorerPage />);
    const prevBtn = await screen.findByRole('button', { name: /Prev/ });
    expect(prevBtn).toBeDisabled();
  });
});
