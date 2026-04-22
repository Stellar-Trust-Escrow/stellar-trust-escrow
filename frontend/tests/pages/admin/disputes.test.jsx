import { screen, fireEvent, waitFor } from '@testing-library/react';
import AdminDisputesPage from '../../../app/admin/disputes/page';
import { renderWithStore } from '../../../store/test-utils';

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = value;
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

global.fetch = jest.fn();

const mockDispute = {
  id: 1,
  escrowId: BigInt(42),
  resolvedAt: null,
  raisedAt: '2025-03-01T10:00:00Z',
  escrow: {
    clientAddress: 'GABCDEF1234567890',
    freelancerAddress: 'GXYZ1234567890',
    totalAmount: '1000 USDC',
  },
};

describe('AdminDisputesPage', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  it('renders page heading', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ disputes: [], pagination: { page: 1, total: 0, pages: 1 } }),
    });
    renderWithStore(<AdminDisputesPage />);
    expect(screen.getByText('Dispute Resolution')).toBeInTheDocument();
  });

  it('renders filter tabs', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ disputes: [], pagination: { page: 1, total: 0, pages: 1 } }),
    });
    renderWithStore(<AdminDisputesPage />);
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolved' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
  });

  it('shows empty state when no disputes', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ disputes: [], pagination: { page: 1, total: 0, pages: 1 } }),
    });
    renderWithStore(<AdminDisputesPage />);
    await waitFor(() => {
      expect(screen.getByText('No disputes found.')).toBeInTheDocument();
    });
  });

  it('renders dispute cards', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ disputes: [mockDispute], pagination: { page: 1, total: 1, pages: 1 } }),
    });
    renderWithStore(<AdminDisputesPage />);
    await waitFor(() => {
      expect(screen.getByText('Dispute #1')).toBeInTheDocument();
    });
  });

  it('shows Resolve button for open disputes', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ disputes: [mockDispute], pagination: { page: 1, total: 1, pages: 1 } }),
    });
    renderWithStore(<AdminDisputesPage />);
    await waitFor(() => {
      expect(screen.getByText('Resolve')).toBeInTheDocument();
    });
  });

  it('opens resolve modal when Resolve is clicked', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ disputes: [mockDispute], pagination: { page: 1, total: 1, pages: 1 } }),
    });
    renderWithStore(<AdminDisputesPage />);
    await waitFor(() => screen.getByText('Resolve'));
    fireEvent.click(screen.getByText('Resolve'));
    expect(screen.getByText('Resolve Dispute #1')).toBeInTheDocument();
  });

  it('closes resolve modal when Cancel is clicked', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ disputes: [mockDispute], pagination: { page: 1, total: 1, pages: 1 } }),
    });
    renderWithStore(<AdminDisputesPage />);
    await waitFor(() => screen.getByText('Resolve'));
    fireEvent.click(screen.getByText('Resolve'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Resolve Dispute #1')).not.toBeInTheDocument();
  });

  it('shows error when fetch fails', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Unauthorized' }),
    });
    renderWithStore(<AdminDisputesPage />);
    await waitFor(() => {
      expect(screen.getByText(/Unauthorized/)).toBeInTheDocument();
    });
  });
});
