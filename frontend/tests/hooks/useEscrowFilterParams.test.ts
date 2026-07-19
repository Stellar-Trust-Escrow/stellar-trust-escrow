import { renderHook, act } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { useEscrowFilterParams, escrowFilterParsers, VALID_STATUSES } from '../../hooks/useEscrowFilterParams';

const wrapper = (searchParams = '') =>
  withNuqsTestingAdapter({ searchParams, hasMemory: true });

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('useEscrowFilterParams', () => {
  describe('default values', () => {
    it('returns empty defaults when no URL params present', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper(''),
      });

      expect(result.current.filters.q).toBe('');
      expect(result.current.filters.status).toEqual([]);
      expect(result.current.filters.amount_min).toBe(0);
      expect(result.current.filters.amount_max).toBe(0);
      expect(result.current.filters.date_from).toBe('');
      expect(result.current.filters.date_to).toBe('');
      expect(result.current.filters.sort).toBe('createdAt');
      expect(result.current.filters.order).toBe('desc');
      expect(result.current.filters.page).toBe(1);
    });

    it('returns activeFilterCount of 0 when no filters active', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper(''),
      });

      expect(result.current.activeFilterCount).toBe(0);
    });
  });

  describe('reading from URL params', () => {
    it('reads q param from URL', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('q=alice'),
      });

      expect(result.current.filters.q).toBe('alice');
    });

    it('reads status array from URL', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('status=Active%2CDisputed'),
      });

      expect(result.current.filters.status).toEqual(['Active', 'Disputed']);
    });

    it('reads amount_min and amount_max from URL', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('amount_min=100&amount_max=5000'),
      });

      expect(result.current.filters.amount_min).toBe(100);
      expect(result.current.filters.amount_max).toBe(5000);
    });

    it('reads date_from and date_to from URL', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('date_from=2025-01-01&date_to=2025-06-30'),
      });

      expect(result.current.filters.date_from).toBe('2025-01-01');
      expect(result.current.filters.date_to).toBe('2025-06-30');
    });

    it('reads sort and order from URL', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('sort=totalAmount&order=asc'),
      });

      expect(result.current.filters.sort).toBe('totalAmount');
      expect(result.current.filters.order).toBe('asc');
    });

    it('reads page from URL', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('page=3'),
      });

      expect(result.current.filters.page).toBe(3);
    });

    it('reads multiple params simultaneously', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('q=bob&status=Active&amount_min=50&sort=totalAmount&order=desc&page=2'),
      });

      expect(result.current.filters.q).toBe('bob');
      expect(result.current.filters.status).toEqual(['Active']);
      expect(result.current.filters.amount_min).toBe(50);
      expect(result.current.filters.sort).toBe('totalAmount');
      expect(result.current.filters.order).toBe('desc');
      expect(result.current.filters.page).toBe(2);
    });
  });

  describe('setting filter values', () => {
    it('setFilter updates q param', async () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper(''),
      });

      await act(async () => {
        await result.current.setFilter('q', 'alice');
      });

      expect(result.current.filters.q).toBe('alice');
    });

    it('setFilter updates status param', async () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper(''),
      });

      await act(async () => {
        await result.current.setFilter('status', ['Active', 'Disputed']);
      });

      expect(result.current.filters.status).toEqual(['Active', 'Disputed']);
    });

    it('setFilter updates amount_min', async () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper(''),
      });

      await act(async () => {
        await result.current.setFilter('amount_min', 100);
      });

      expect(result.current.filters.amount_min).toBe(100);
    });

    it('setFilter updates sort', async () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper(''),
      });

      await act(async () => {
        await result.current.setFilter('sort', 'totalAmount');
      });

      expect(result.current.filters.sort).toBe('totalAmount');
    });

    it('setFilter with null clears the param', async () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('q=alice'),
      });

      expect(result.current.filters.q).toBe('alice');

      await act(async () => {
        await result.current.setFilter('q', null);
      });

      expect(result.current.filters.q).toBe('');
    });
  });

  describe('resetFilters', () => {
    it('clears all filter params to defaults', async () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('q=alice&status=Active&amount_min=100&amount_max=5000&date_from=2025-01-01&date_to=2025-06-30&sort=totalAmount&order=asc&page=5'),
      });

      await act(async () => {
        await result.current.resetFilters();
      });

      expect(result.current.filters.q).toBe('');
      expect(result.current.filters.status).toEqual([]);
      expect(result.current.filters.amount_min).toBe(0);
      expect(result.current.filters.amount_max).toBe(0);
      expect(result.current.filters.date_from).toBe('');
      expect(result.current.filters.date_to).toBe('');
      expect(result.current.filters.sort).toBe('createdAt');
      expect(result.current.filters.order).toBe('desc');
      expect(result.current.filters.page).toBe(1);
    });
  });

  describe('activeFilterCount', () => {
    it('counts active q filter', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('q=alice'),
      });

      expect(result.current.activeFilterCount).toBe(1);
    });

    it('counts active status filter', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('status=Active'),
      });

      expect(result.current.activeFilterCount).toBe(1);
    });

    it('counts multiple active filters', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('q=alice&status=Active&amount_min=100&date_from=2025-01-01'),
      });

      expect(result.current.activeFilterCount).toBe(4);
    });

    it('does not count default sort/order as active', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('sort=createdAt&order=desc'),
      });

      expect(result.current.activeFilterCount).toBe(0);
    });

    it('counts non-default sort as active', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('sort=totalAmount'),
      });

      expect(result.current.activeFilterCount).toBe(1);
    });

    it('does not count default amount values as active', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('amount_min=0&amount_max=0'),
      });

      expect(result.current.activeFilterCount).toBe(0);
    });
  });

  describe('apiQueryString', () => {
    it('returns default query string with limit', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper(''),
      });

      expect(result.current.apiQueryString).toContain('sortBy=createdAt');
      expect(result.current.apiQueryString).toContain('sortOrder=desc');
      expect(result.current.apiQueryString).toContain('limit=12');
    });

    it('includes search param when q is set', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('q=alice'),
      });

      expect(result.current.apiQueryString).toContain('search=alice');
    });

    it('includes status param as comma-separated', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('status=Active%2CDisputed'),
      });

      expect(result.current.apiQueryString).toContain('status=');
      expect(result.current.apiQueryString).toContain('Active');
      expect(result.current.apiQueryString).toContain('Disputed');
    });

    it('includes amount params', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('amount_min=100&amount_max=5000'),
      });

      expect(result.current.apiQueryString).toContain('minAmount=100');
      expect(result.current.apiQueryString).toContain('maxAmount=5000');
    });

    it('includes date params', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('date_from=2025-01-01&date_to=2025-06-30'),
      });

      expect(result.current.apiQueryString).toContain('dateFrom=2025-01-01');
      expect(result.current.apiQueryString).toContain('dateTo=2025-06-30');
    });

    it('includes page only when greater than 1', () => {
      const { result: r1 } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('page=1'),
      });
      expect(r1.current.apiQueryString).not.toContain('page=');

      const { result: r2 } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('page=3'),
      });
      expect(r2.current.apiQueryString).toContain('page=3');
    });

    it('omits default amount values', () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper(''),
      });

      expect(result.current.apiQueryString).not.toContain('minAmount');
      expect(result.current.apiQueryString).not.toContain('maxAmount');
    });
  });

  describe('copyFilterUrl', () => {
    it('copies current URL to clipboard', async () => {
      const { result } = renderHook(() => useEscrowFilterParams(), {
        wrapper: wrapper('q=alice&status=Active'),
      });

      await act(async () => {
        await result.current.copyFilterUrl();
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.any(String),
      );
    });
  });

  describe('parser configuration', () => {
    it('exports VALID_STATUSES', () => {
      expect(VALID_STATUSES).toEqual(['Active', 'Completed', 'Disputed', 'Cancelled']);
    });

    it('exports escrowFilterParsers with expected keys', () => {
      const keys = Object.keys(escrowFilterParsers);
      expect(keys).toContain('q');
      expect(keys).toContain('status');
      expect(keys).toContain('amount_min');
      expect(keys).toContain('amount_max');
      expect(keys).toContain('date_from');
      expect(keys).toContain('date_to');
      expect(keys).toContain('sort');
      expect(keys).toContain('order');
      expect(keys).toContain('page');
    });
  });
});
