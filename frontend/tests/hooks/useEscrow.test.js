import { renderHook } from '@testing-library/react';
import { useEscrow, useUserEscrows, useEscrowList } from '../../hooks/useEscrow';

describe('useEscrow', () => {
  it('returns null escrow and error (not yet implemented)', () => {
    const { result } = renderHook(() => useEscrow(1));
    expect(result.current.escrow).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.mutate).toBeInstanceOf(Function);
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
