import { renderHook, act } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { useCompareParams, MAX_COMPARE_ESCOWS } from '../../hooks/useCompareParams';

const wrapper = (searchParams = '') => withNuqsTestingAdapter({ searchParams, hasMemory: true });

describe('useCompareParams', () => {
  it('defaults to an empty selection', () => {
    const { result } = renderHook(() => useCompareParams(), { wrapper: wrapper('') });
    expect(result.current.compareIds).toEqual([]);
    expect(result.current.isCompareSelected('1')).toBe(false);
  });

  it('reads compare ids from the URL', () => {
    const { result } = renderHook(() => useCompareParams(), {
      wrapper: wrapper('compare=1,2,3'),
    });
    expect(result.current.compareIds).toEqual(['1', '2', '3']);
  });

  it('toggles a selection on/off', () => {
    const { result } = renderHook(() => useCompareParams(), { wrapper: wrapper('') });

    act(() => {
      result.current.toggleCompare(1);
    });
    expect(result.current.compareIds).toEqual(['1']);
    expect(result.current.isCompareSelected(1)).toBe(true);

    act(() => {
      result.current.toggleCompare(1);
    });
    expect(result.current.compareIds).toEqual([]);
  });

  it('refuses to add beyond MAX_COMPARE_ESCOWS', () => {
    const { result } = renderHook(() => useCompareParams(), {
      wrapper: wrapper('compare=1,2,3,4'),
    });

    act(() => {
      result.current.toggleCompare(5);
    });
    expect(result.current.compareIds).toEqual(['1', '2', '3', '4']);
  });

  it('removes a single id', () => {
    const { result } = renderHook(() => useCompareParams(), {
      wrapper: wrapper('compare=1,2,3'),
    });

    act(() => {
      result.current.removeCompare(2);
    });
    expect(result.current.compareIds).toEqual(['1', '3']);
  });

  it('clears the whole selection', () => {
    const { result } = renderHook(() => useCompareParams(), {
      wrapper: wrapper('compare=1,2,3'),
    });

    act(() => {
      result.current.clearCompare();
    });
    expect(result.current.compareIds).toEqual([]);
  });
});
