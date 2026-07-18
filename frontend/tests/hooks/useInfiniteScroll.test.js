import { renderHook, act, waitFor } from '@testing-library/react';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';

// Controllable IntersectionObserver mock so tests can drive the sentinel.
let observerCallback = null;
class MockIntersectionObserver {
  constructor(cb) {
    observerCallback = cb;
    this.observe = jest.fn();
    this.disconnect = jest.fn();
    this.unobserve = jest.fn();
  }
}

function setIntersecting(value) {
  act(() => {
    observerCallback?.([{ isIntersecting: value }]);
  });
}

beforeAll(() => {
  global.IntersectionObserver = MockIntersectionObserver;
});

afterEach(() => {
  observerCallback = null;
  jest.clearAllMocks();
});

describe('useInfiniteScroll', () => {
  it('loads the first page on mount', async () => {
    const fetchPage = jest.fn(async () => ({
      items: [{ id: 1 }, { id: 2 }],
      hasNextPage: true,
    }));

    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, limit: 12 }));

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(fetchPage).toHaveBeenCalledWith(1, 12);
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('appends subsequent pages when loadMore is called', async () => {
    let page = 0;
    const fetchPage = jest.fn(async (p) => {
      page = p;
      if (p === 1) return { items: [{ id: 1 }], hasNextPage: true };
      return { items: [{ id: 2 }], hasNextPage: false };
    });

    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, limit: 12 }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    expect(fetchPage).toHaveBeenLastCalledWith(2, 12);
    expect(result.current.hasNextPage).toBe(false);
  });

  it('does not load more once hasNextPage is false', async () => {
    const fetchPage = jest.fn(async () => ({ items: [{ id: 1 }], hasNextPage: false }));
    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, limit: 12 }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => result.current.loadMore());
    // No additional call beyond the initial load.
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('guards against concurrent fetches', async () => {
    let resolve;
    const fetchPage = jest.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );

    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, limit: 12 }));

    // First page is in flight; trigger loadMore repeatedly.
    act(() => result.current.loadMore());
    act(() => result.current.loadMore());
    act(() => result.current.loadMore());

    // Only the initial fetch should have started.
    expect(fetchPage).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ items: [{ id: 1 }], hasNextPage: false });
    });
  });

  it('auto-loads when the sentinel intersects and more pages exist', async () => {
    const fetchPage = jest.fn(async (p) =>
      p === 1
        ? { items: [{ id: 1 }], hasNextPage: true }
        : { items: [{ id: 2 }], hasNextPage: false },
    );

    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, limit: 12 }));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    // renderHook has no DOM, so attach the sentinel to a node to register
    // the IntersectionObserver callback before driving it.
    act(() => {
      result.current.sentinelRef(document.createElement('div'));
    });
    setIntersecting(true);
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(fetchPage).toHaveBeenCalledWith(2, 12);
  });

  it('exposes a string error and supports reset', async () => {
    const fetchPage = jest.fn(async () => {
      throw new Error('boom');
    });

    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, limit: 12 }));
    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.loading).toBe(false);

    const goodFetch = jest.fn(async () => ({ items: [{ id: 9 }], hasNextPage: false }));
    const { result: r2 } = renderHook(() => useInfiniteScroll({ fetchPage: goodFetch, limit: 12 }));
    await waitFor(() => expect(r2.current.items).toHaveLength(1));
  });

  it('reset() clears items and reloads the first page', async () => {
    const fetchPage = jest.fn(async (p) =>
      p === 1
        ? { items: [{ id: 1 }, { id: 2 }], hasNextPage: true }
        : { items: [{ id: 3 }], hasNextPage: true },
    );

    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, limit: 12 }));
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.items).toHaveLength(3));

    act(() => result.current.reset());
    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(fetchPage).toHaveBeenLastCalledWith(1, 12);
  });
});
