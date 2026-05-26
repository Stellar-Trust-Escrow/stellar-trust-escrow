import { renderHook } from '@testing-library/react';
import useSWR from 'swr';
import { useEscrow, useUserEscrows, useEscrowList } from '../../hooks/useEscrow';

jest.mock('swr');

const mockMutate = jest.fn();

beforeEach(() => {
  useSWR.mockReturnValue({
    data: undefined,
    error: undefined,
    isLoading: false,
    mutate: mockMutate,
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('useEscrow', () => {
  it('calls useSWR with the correct URL when id is provided', () => {
    renderHook(() => useEscrow(42));

    expect(useSWR).toHaveBeenCalledWith(
      expect.stringContaining('/api/escrows/42'),
      expect.any(Function),
      expect.any(Object)
    );
  });

  it('passes null key to useSWR when id is falsy (skips fetch)', () => {
    renderHook(() => useEscrow(null));

    expect(useSWR).toHaveBeenCalledWith(null, expect.any(Function), expect.any(Object));
  });

  it('configures 30-second polling interval', () => {
    renderHook(() => useEscrow(1));

    const [, , options] = useSWR.mock.calls[0];
    expect(options.refreshInterval).toBe(30_000);
  });

  it('pauses polling when page is hidden (refreshWhenHidden: false)', () => {
    renderHook(() => useEscrow(1));

    const [, , options] = useSWR.mock.calls[0];
    expect(options.refreshWhenHidden).toBe(false);
  });

  it('returns escrow data from SWR', () => {
    const MOCK_ESCROW = { id: 1, title: 'Audit', status: 'Active' };
    useSWR.mockReturnValue({ data: MOCK_ESCROW, error: undefined, isLoading: false, mutate: mockMutate });

    const { result } = renderHook(() => useEscrow(1));

    expect(result.current.escrow).toEqual(MOCK_ESCROW);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeUndefined();
    expect(result.current.mutate).toBe(mockMutate);
  });

  it('returns loading state when SWR is fetching', () => {
    useSWR.mockReturnValue({ data: undefined, error: undefined, isLoading: true, mutate: mockMutate });

    const { result } = renderHook(() => useEscrow(1));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.escrow).toBeUndefined();
  });

  it('returns error from SWR when fetch fails', () => {
    const fetchError = new Error('Network error');
    useSWR.mockReturnValue({ data: undefined, error: fetchError, isLoading: false, mutate: mockMutate });

    const { result } = renderHook(() => useEscrow(1));

    expect(result.current.error).toBe(fetchError);
    expect(result.current.escrow).toBeUndefined();
  });
});

describe('useUserEscrows', () => {
  it('returns empty escrows array', () => {
    const { result } = renderHook(() => useUserEscrows('GABC123'));
    expect(result.current.escrows).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});

describe('useEscrowList', () => {
  it('returns empty list with defaults', () => {
    const { result } = renderHook(() => useEscrowList());
    expect(result.current.escrows).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('accepts page, limit, status options', () => {
    const { result } = renderHook(() => useEscrowList({ page: 2, limit: 10, status: 'Active' }));
    expect(result.current.escrows).toEqual([]);
  });
});
