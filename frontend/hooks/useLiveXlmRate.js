import { useState, useEffect, useRef, useCallback } from 'react';

const POLL_INTERVAL_MS = 60_000;

/**
 * Polls GET /api/v1/market/xlm-usd every 60s.
 * Pauses polling while the tab is hidden (resumes + refetches on focus).
 *
 * @returns {{ rate_usd: number|null, stale: boolean, loading: boolean }}
 */
export function useLiveXlmRate() {
  const [state, setState] = useState({ rate_usd: null, stale: false, loading: true });
  const intervalRef = useRef(null);

  const fetchRate = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/market/xlm-usd');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState({ rate_usd: data.price_usd, stale: Boolean(data.stale), loading: false });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchRate();

    const startPolling = () => {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(fetchRate, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchRate();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchRate]);

  return state;
}

export default useLiveXlmRate;
