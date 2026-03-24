import { render, screen, fireEvent } from '@testing-library/react';
import ExplorerPage from '../../app/explorer/page';

describe('ExplorerPage', () => {
  it('renders page heading', () => {
    render(<ExplorerPage />);
    expect(screen.getByRole('heading', { name: 'Escrow Explorer' })).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<ExplorerPage />);
    expect(screen.getByPlaceholderText(/Search by title/)).toBeInTheDocument();
  });

  it('renders status filter buttons', () => {
    render(<ExplorerPage />);
    ['All', 'Active', 'Completed', 'Disputed', 'Cancelled'].forEach((f) => {
      expect(screen.getByRole('button', { name: f })).toBeInTheDocument();
    });
  });

  it('renders all placeholder escrows by default', () => {
    render(<ExplorerPage />);
    expect(screen.getByText('Website Redesign')).toBeInTheDocument();
    expect(screen.getByText('API Development')).toBeInTheDocument();
    expect(screen.getByText('Logo Package')).toBeInTheDocument();
    expect(screen.getByText('Smart Contract')).toBeInTheDocument();
  });

  it('filters escrows by status', () => {
    render(<ExplorerPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }));
    expect(screen.getByText('Logo Package')).toBeInTheDocument();
    expect(screen.queryByText('Website Redesign')).not.toBeInTheDocument();
  });

  it('filters escrows by search query', () => {
    render(<ExplorerPage />);
    fireEvent.change(screen.getByPlaceholderText(/Search by title/), {
      target: { value: 'API' },
    });
    expect(screen.getByText('API Development')).toBeInTheDocument();
    expect(screen.queryByText('Website Redesign')).not.toBeInTheDocument();
  });

  it('shows empty state when no escrows match filter', () => {
    render(<ExplorerPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelled' }));
    expect(screen.getByText(/No escrows found/)).toBeInTheDocument();
  });

  it('renders stats bar', () => {
    render(<ExplorerPage />);
    expect(screen.getByText('Total Escrows')).toBeInTheDocument();
    expect(screen.getByText('Total Locked')).toBeInTheDocument();
    expect(screen.getByText('Total Users')).toBeInTheDocument();
  });

  it('renders pagination buttons', () => {
    render(<ExplorerPage />);
    expect(screen.getByRole('button', { name: /Prev/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/ })).toBeInTheDocument();
  });

  it('Prev button is disabled on first page', () => {
    render(<ExplorerPage />);
    expect(screen.getByRole('button', { name: /Prev/ })).toBeDisabled();
  });
});
