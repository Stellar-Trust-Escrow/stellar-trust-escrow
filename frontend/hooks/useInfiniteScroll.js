/**
 * useInfiniteScroll Hook
 *
 * Encapsulates the state and scroll-triggered loading for an infinitely
 * scrolling list. It accumulates paginated results, exposes a sentinel ref
 * (to be attached to a bottom marker element) and a manual `loadMore`
 * trigger for keyboard / screen-reader users.
 *
 * The hook is presentation-agnostic: the caller supplies a `fetchPage`
 * function that returns the next slice of items. This keeps the escrow
 * list page, and any future consumer, free of duplicated pagination state.
 *
 * @param {object} options
 * @param {(page: number, limit: number) => Promise<{ items: any[], hasNextPage: boolean }>} options.fetchPage
 *        Async function returning the next page of items.
 * @param {number} [options.limit=12] — page size requested from the API
 * @param {string} [options.rootMargin='300px'] — rootMargin for the sentinel observer
 *        (pre-loads before the marker is fully in view)
 * @param {Array} [options.deps=[]] — values whose change should reload from page 1
 *        (e.g. the active search term and filters). On mount the hook always
 *        performs an initial load.
 *
 * @returns {{
 *   items: any[],
 *   loading: boolean,        — true during the very first load
 *   loadingMore: boolean,    — true while appending additional pages
 *   error: string | null,
 *   hasNextPage: boolean,
 *   sentinelRef: React.RefCallback,
 *   isIntersecting: boolean,
 *   loadMore: () => void,    — manual trigger (button / keyboard)
 *   reset: () => void,       — clear state and reload page 1
 * }}
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useIntersectionObserver } from './useIntersectionObserver';

export function useInfiniteScroll({ fetchPage, limit = 12, rootMargin = '300px', deps = [] }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  // Guards against concurrent fetches (e.g. observer firing while a manual
  // load is in flight) and against state updates after unmount. Starts true
  // so the very first (mount) load is not discarded before the effect runs.
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadPage = useCallback(
    async (targetPage, { append }) => {
      if (inFlight.current) return;
      inFlight.current = true;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        console.error(
          '[LOADPAGE] target=' + targetPage + ' append=' + append + ' mounted=' + mounted.current,
        );
        const { items: nextItems, hasNextPage: more } = await fetchPage(targetPage, limit);
        console.error('[LOADPAGE] got ' + (nextItems || []).length + ' items');
        if (!mounted.current) return;
        setItems((prev) => {
          const next = append ? [...prev, ...nextItems] : nextItems;
          console.error(
            '[SETITEMS] prev=' + prev.length + ' got=' + nextItems.length + ' -> ' + next.length,
          );
          return next;
        });
        setHasNextPage(more);
        setPage(targetPage + 1);
      } catch (err) {
        if (!mounted.current) return;
        setError(err?.message || 'Failed to load results');
      } finally {
        if (mounted.current) {
          inFlight.current = false;
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [fetchPage, limit],
  );

  // First load + reset when upstream query (search/filters) changes.
  const reset = useCallback(() => {
    console.error('[RESET] clearing items');
    setItems([]);
    setPage(1);
    setHasNextPage(false);
    setError(null);
    loadPage(1, { append: false });
  }, [loadPage]);

  // Append the next page on demand (scroll sentinel or manual button).
  const loadMore = useCallback(() => {
    console.error(
      '[LOADMORE] inFlight=' + inFlight.current + ' hasNext=' + hasNextPage + ' page=' + page,
    );
    if (inFlight.current || !hasNextPage) return;
    loadPage(page, { append: true });
  }, [loadPage, hasNextPage, page]);

  // Initial load on mount, and a clean reload whenever `deps` change.
  useEffect(() => {
    console.error('[DEPS] reset fired deps=' + JSON.stringify(deps));
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const { ref: sentinelRef, isIntersecting } = useIntersectionObserver({
    rootMargin,
    triggerOnce: false,
  });

  // Auto-load whenever the sentinel is on screen and more data exists.
  // Re-runs after each load completes (loadingMore flips back to false) so a
  // short viewport is filled with as many pages as needed.
  useEffect(() => {
    if (isIntersecting && hasNextPage && !loadingMore && !loading) {
      loadMore();
    }
  }, [isIntersecting, hasNextPage, loadingMore, loading, loadMore]);

  return {
    items,
    loading,
    loadingMore,
    error,
    hasNextPage,
    sentinelRef,
    isIntersecting,
    loadMore,
    reset,
  };
}
