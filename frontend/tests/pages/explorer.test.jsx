import { render, screen, waitFor } from '@testing-library/react';
import ExplorerPage from '../../app/explorer/page';

global.fetch = jest.fn();

const emptyApiResponse = {
  data: [],
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

const populatedApiResponse = {
  data: [
    { id: 1, status: 'Active', totalAmount: '5000', clientAddress: 'GABCDEFGHIJKLMNOP' },
    { id: 2, status: 'Completed', totalAmount: '3000', clientAddress: 'GXYZ1234567890ABC' },
  ],
  total: 2,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const paginatedApiResponse = {
  data: [{ id: 1, status: 'Active', totalAmount: '5000', clientAddress: 'GABCDEFGHIJKLMNOP' }],
  total: 25,
  totalPages: 3,
  hasNextPage: true,
  hasPreviousPage: false,
};

describe('ExplorerPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => emptyApiResponse,
    });
  });

  it('renders page heading', () => {
    render(<ExplorerPage />);
    expect(screen.getByRole('heading', { name: 'Escrow Explorer' })).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<ExplorerPage />);
    expect(screen.getByPlaceholderText(/Search by escrow ID or address/)).toBeInTheDocument();
  });

  it('renders stats bar labels', () => {
    render(<ExplorerPage />);
    expect(screen.getByText('Total Escrows')).toBeInTheDocument();
    expect(screen.getByText('Page')).toBeInTheDocument();
    expect(screen.getByText('Showing')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    global.fetch.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ExplorerPage />);
    expect(screen.getByText(/Loading escrows/)).toBeInTheDocument();
  });

  it('renders escrows after fetch resolves', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => populatedApiResponse,
    });
    render(<ExplorerPage />);
    await waitFor(() => {
      expect(screen.getByText('Escrow #1')).toBeInTheDocument();
      expect(screen.getByText('Escrow #2')).toBeInTheDocument();
    });
  });

  it('shows empty state when API returns no escrows', async () => {
    render(<ExplorerPage />);
    await waitFor(() => {
      expect(screen.getByText(/No escrows found/)).toBeInTheDocument();
    });
  });

  it('shows error state when fetch fails', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    render(<ExplorerPage />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load escrows/)).toBeInTheDocument();
    });
  });

  it('renders filters toggle button', () => {
    render(<ExplorerPage />);
    expect(screen.getByRole('button', { name: /Filters/ })).toBeInTheDocument();
  });

  it('renders pagination buttons when multiple pages exist', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => paginatedApiResponse,
    });
    render(<ExplorerPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Prev/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Next/ })).toBeInTheDocument();
    });
  });

  it('Prev button is disabled on first page', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => paginatedApiResponse,
    });
    render(<ExplorerPage />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Prev/ })).toBeDisabled();
    });
  });
});
