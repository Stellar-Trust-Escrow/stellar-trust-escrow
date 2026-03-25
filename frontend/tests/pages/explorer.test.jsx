import { render, screen, fireEvent } from '@testing-library/react';
import ExplorerPage from '../../app/explorer/page';

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
    render(<ExplorerPage />);
    expect(await screen.findByRole('heading', { name: 'Escrow Explorer' })).toBeInTheDocument();
  });

  it('renders search input', async () => {
    render(<ExplorerPage />);
    expect(await screen.findByPlaceholderText(/Search by/)).toBeInTheDocument();
  });

  it('renders status filter buttons', async () => {
    render(<ExplorerPage />);
    expect(await screen.findByText("Filters")).toBeInTheDocument();
  });

  it('renders fetched escrows by default', async () => {
    render(<ExplorerPage />);
    expect(await screen.findByText('Escrow #1')).toBeInTheDocument();
    expect(screen.getByText('Escrow #2')).toBeInTheDocument();
    expect(screen.getByText('Escrow #3')).toBeInTheDocument();
    expect(screen.getByText('Escrow #4')).toBeInTheDocument();
  });

  it('filters escrows by status', async () => {
    render(<ExplorerPage />);
    // Wait for initial render
    await screen.findByText('Escrow #1');
    fireEvent.click(screen.getByText('Filters'));
    
    // Click Completed filter
    const completedBtn = await screen.findByRole('button', { name: 'Completed' });
    fireEvent.click(completedBtn);

    expect(await screen.findByText('Escrow #3')).toBeInTheDocument();
    expect(screen.queryByText('Escrow #1')).not.toBeInTheDocument();
  });

  it('filters escrows by search query', async () => {
    render(<ExplorerPage />);
    await screen.findByText('Escrow #1'); // wait for initial render

    const searchInput = await screen.findByPlaceholderText(/Search by/);
    
    fireEvent.change(searchInput, { target: { value: '2' } });

    const { waitFor } = require('@testing-library/react');
    await waitFor(() => {
      expect(screen.queryByText('Escrow #1')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Escrow #2')).toBeInTheDocument();
  });

  it('shows empty state when no escrows match filter', async () => {
    render(<ExplorerPage />);
    await screen.findByText('Escrow #1');
    
    fireEvent.click(screen.getByText('Filters'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelled' }));

    expect(await screen.findByText(/No escrows found/)).toBeInTheDocument();
  });

  it('renders stats bar', async () => {
    render(<ExplorerPage />);
    expect(await screen.findByText('Total Escrows')).toBeInTheDocument();
  });

  it('renders pagination buttons', async () => {
    render(<ExplorerPage />);
    expect(await screen.findByRole('button', { name: /Prev/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/ })).toBeInTheDocument();
  });

  it('Prev button is disabled on first page', async () => {
    render(<ExplorerPage />);
    const prevBtn = await screen.findByRole('button', { name: /Prev/ });
    expect(prevBtn).toBeDisabled();
  });
});
