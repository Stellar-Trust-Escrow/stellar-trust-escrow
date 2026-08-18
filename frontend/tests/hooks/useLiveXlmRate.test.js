import { renderHook, waitFor, act } from '@testing-library/react';
import { useLiveXlmRate } from '../../hooks/useLiveXlmRate';

function mockFetchOnce(body, ok = true) {
  global.fetch.mockResolvedValueOnce({ ok, json: async () => body });
}

describe('useLiveXlmRate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('fetches the rate on mount', async () => {
    mockFetchOnce({ price_usd: 0.42, source: 'coingecko', stale: false });

    const { result } = renderHook(() => useLiveXlmRate());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rate_usd).toBeCloseTo(0.42);
    expect(result.current.stale).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/market/xlm-usd');
  });

  it('polls again after 60s', async () => {
    mockFetchOnce({ price_usd: 0.42, source: 'coingecko', stale: false });
    const { result } = renderHook(() => useLiveXlmRate());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockFetchOnce({ price_usd: 0.45, source: 'coingecko', stale: false });
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    await waitFor(() => expect(result.current.rate_usd).toBeCloseTo(0.45));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('clears the interval on unmount', async () => {
    mockFetchOnce({ price_usd: 0.42, source: 'coingecko', stale: false });
    const { unmount, result } = renderHook(() => useLiveXlmRate());
    await waitFor(() => expect(result.current.loading).toBe(false));

    unmount();
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });

    // Only the initial mount fetch — nothing after unmount.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('stops polling while the tab is hidden', async () => {
    mockFetchOnce({ price_usd: 0.42, source: 'coingecko', stale: false });
    const { result } = renderHook(() => useLiveXlmRate());
    await waitFor(() => expect(result.current.loading).toBe(false));

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await act(async () => {
      jest.advanceTimersByTime(180_000);
    });

    // No refetch triggered while hidden (only the initial mount call).
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('marks loading false without throwing when the fetch fails', async () => {
    global.fetch.mockRejectedValueOnce(new Error('network down'));

    const { result } = renderHook(() => useLiveXlmRate());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rate_usd).toBeNull();
  });
});
