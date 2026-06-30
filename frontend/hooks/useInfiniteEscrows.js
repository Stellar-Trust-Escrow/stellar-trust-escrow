'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function buildQuery({ search, filters, cursor, limit }) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  if (search) params.set('search', search);
  if (filters.statuses?.length) params.set('status', filters.statuses.join(','));
  if (filters.minAmount) params.set('minAmount', filters.minAmount);
  if (filters.maxAmount) params.set('maxAmount', filters.maxAmount);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.sort) {
    const [sortBy, sortOrder] = filters.sort.split(':');
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder || 'desc');
  }
  return params.toString();
}

function normaliseEscrow(e) {
  return {
    id: String(e.id),
    title: `Escrow #${e.id}`,
    status: e.status,
    totalAmount: `${Number(e.totalAmount).toLocaleString()} USDC`,
    milestoneProgress: '0 / 0',
    counterparty: e.clientAddress
      ? `${e.clientAddress.slice(0, 4)}…${e.clientAddress.slice(-4)}`
      : '—',
    role: 'client',
  };
}

/**
 * Cursor-based infinite scroll hook for the escrow list.
 * Accumulates pages; call fetchNext() to load the next page.
 * Reset by changing search/filters (triggers automatic reload).
 */
export function useInfiniteEscrows({ search = '', filters = {}, limit = 12 } = {}) {
  const [escrows, setEscrows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const inflightRef = useRef(false);
  const cursorRef = useRef(null);

  // Reset and reload when search/filters change.
  // JSON.stringify(filters) in the dep array avoids stale closures when filter
  // objects are recreated on every render but have the same logical value.
  useEffect(() => {
    let cancelled = false;
    inflightRef.current = false;
    cursorRef.current = null;
    setEscrows([]);
    setCursor(null);
    setHasMore(true);
    setError(null);
    setInitialLoading(true);
    setLoading(true);

    const qs = buildQuery({ search, filters, cursor: null, limit });
    fetch(`${API_BASE}/api/escrows?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        // Support both cursor-based (`next_cursor`/`has_more`) and legacy
        // page-based (`totalPages`) API shapes during migration.
        const items = json.data || json.escrows || [];
        const nextCursor = json.next_cursor ?? null;
        const more = json.has_more !== undefined ? Boolean(json.has_more) : Boolean(nextCursor);
        setEscrows(items.map(normaliseEscrow));
        cursorRef.current = nextCursor;
        setCursor(nextCursor);
        setHasMore(more);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, JSON.stringify(filters), limit]);

  const fetchNext = useCallback(async () => {
    if (inflightRef.current || !cursorRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const qs = buildQuery({ search, filters, cursor: cursorRef.current, limit });
      const res = await fetch(`${API_BASE}/api/escrows?${qs}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const json = await res.json();
      const items = json.data || json.escrows || [];
      const nextCursor = json.next_cursor ?? null;
      const more = json.has_more !== undefined ? Boolean(json.has_more) : Boolean(nextCursor);
      setEscrows((prev) => [...prev, ...items.map(normaliseEscrow)]);
      cursorRef.current = nextCursor;
      setCursor(nextCursor);
      setHasMore(more);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      inflightRef.current = false;
    }
  }, [search, filters, limit]);

  return { escrows, hasMore, loading, initialLoading, error, fetchNext };
}
