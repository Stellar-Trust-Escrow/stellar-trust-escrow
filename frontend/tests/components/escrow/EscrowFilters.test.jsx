import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EscrowFilters from '../../../components/escrow/EscrowFilters';
import { useRouter, useSearchParams } from 'next/navigation';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

describe('EscrowFilters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({
      push: jest.fn(),
    });
    useSearchParams.mockReturnValue(new URLSearchParams());
  });

  it('renders all filter sections', () => {
    render(<EscrowFilters />);
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
    expect(screen.getByTestId('status-Active')).toBeInTheDocument();
    expect(screen.getByTestId('date-from')).toBeInTheDocument();
    expect(screen.getByTestId('date-to')).toBeInTheDocument();
    expect(screen.getByTestId('amount-min')).toBeInTheDocument();
    expect(screen.getByTestId('amount-max')).toBeInTheDocument();
  });

  it('updates search input', () => {
    render(<EscrowFilters />);
    const searchInput = screen.getByTestId('search-input');
    fireEvent.change(searchInput, { target: { value: 'ABC123' } });
    expect(searchInput.value).toBe('ABC123');
  });

  it('toggles status filter', () => {
    render(<EscrowFilters />);
    const activeBtn = screen.getByTestId('status-Active');
    fireEvent.click(activeBtn);
    expect(activeBtn).toHaveClass('bg-indigo-600');
    fireEvent.click(activeBtn);
    expect(activeBtn).not.toHaveClass('bg-indigo-600');
  });

  it('selects multiple statuses', () => {
    render(<EscrowFilters />);
    fireEvent.click(screen.getByTestId('status-Active'));
    fireEvent.click(screen.getByTestId('status-Completed'));
    expect(screen.getByTestId('status-Active')).toHaveClass('bg-indigo-600');
    expect(screen.getByTestId('status-Completed')).toHaveClass('bg-indigo-600');
  });

  it('updates date range', () => {
    render(<EscrowFilters />);
    const dateFrom = screen.getByTestId('date-from');
    const dateTo = screen.getByTestId('date-to');
    fireEvent.change(dateFrom, { target: { value: '2026-01-01' } });
    fireEvent.change(dateTo, { target: { value: '2026-12-31' } });
    expect(dateFrom.value).toBe('2026-01-01');
    expect(dateTo.value).toBe('2026-12-31');
  });

  it('updates amount range', () => {
    render(<EscrowFilters />);
    const amountMin = screen.getByTestId('amount-min');
    const amountMax = screen.getByTestId('amount-max');
    fireEvent.change(amountMin, { target: { value: '100' } });
    fireEvent.change(amountMax, { target: { value: '1000' } });
    expect(amountMin.value).toBe('100');
    expect(amountMax.value).toBe('1000');
  });

  it('shows filter count badge when filters are active', async () => {
    render(<EscrowFilters />);
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'test' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('filter-badge')).toBeInTheDocument();
    });
  });

  it('clears all filters', async () => {
    render(<EscrowFilters />);
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'test' },
    });
    fireEvent.click(screen.getByTestId('status-Active'));

    await waitFor(() => {
      expect(screen.getByTestId('clear-filters')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('clear-filters'));

    expect(screen.getByTestId('search-input').value).toBe('');
    expect(screen.getByTestId('status-Active')).not.toHaveClass('bg-indigo-600');
  });

  it('calls onFiltersChange callback', async () => {
    const onFiltersChange = jest.fn();
    render(<EscrowFilters onFiltersChange={onFiltersChange} />);

    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'test' },
    });

    await waitFor(() => {
      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'test',
        }),
      );
    });
  });

  it('persists filters to URL params', async () => {
    const mockPush = jest.fn();
    useRouter.mockReturnValue({
      push: mockPush,
    });

    render(<EscrowFilters />);
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'escrow123' },
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('q=escrow123'));
    });
  });

  it('displays correct filter badge count', async () => {
    render(<EscrowFilters />);
    fireEvent.change(screen.getByTestId('search-input'), {
      target: { value: 'test' },
    });
    fireEvent.click(screen.getByTestId('status-Active'));

    await waitFor(() => {
      const badge = screen.getByTestId('filter-badge');
      expect(badge.textContent).toContain('2 filters active');
    });
  });
});
