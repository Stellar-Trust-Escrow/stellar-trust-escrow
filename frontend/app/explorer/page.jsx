'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import Spinner from '../../components/ui/Spinner';
import EscrowCard from '../../components/escrow/EscrowCard';
import SearchFilters from '../../components/explorer/SearchFilters';
import EmptyState from '../../components/ui/EmptyState';
import ErrorBoundary from '../../components/error/ErrorBoundary';
import { useInfiniteEscrows } from '../../hooks/useInfiniteEscrows';
import { useIntersectionObserver } from '../../hooks/useIntersectionObserver';

const SCROLL_KEY = 'explorer-scroll-y';

const DEFAULT_FILTERS = {
  statuses: [],
  minAmount: '',
  maxAmount: '',
  dateFrom: '',
  dateTo: '',
  sort: 'createdAt:desc',
};

function filtersFromUrl(sp) {
  const statusParam = sp.get('status') || '';
  return {
    statuses: statusParam ? statusParam.split(',') : [],
    minAmount: sp.get('minAmount') || '',
    maxAmount: sp.get('maxAmount') || '',
    dateFrom: sp.get('dateFrom') || '',
    dateTo: sp.get('dateTo') || '',
    sort: sp.get('sortBy')
      ? `${sp.get('sortBy')}:${sp.get('sortOrder') || 'desc'}`
      : 'createdAt:desc',
  };
}

function ExplorerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [filters, setFilters] = useState(() => filtersFromUrl(searchParams));
  const [showFilters, setShowFilters] = useState(false);
  const listRef = useRef(null);

  const debounceTimer = useRef(null);
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(debounceTimer.current);
  }, [search]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    router.replace(`/explorer?${params.toString()}`, { scroll: false });
  }, [debouncedSearch, router]);

  const { escrows, hasMore, loading, initialLoading, error, fetchNext } = useInfiniteEscrows({
    search: debouncedSearch,
    filters,
    limit: 12,
  });

  // Restore scroll position when navigating back
  useEffect(() => {
    const saved = sessionStorage.getItem(SCROLL_KEY);
    if (saved) {
      window.scrollTo({ top: Number(saved) });
      sessionStorage.removeItem(SCROLL_KEY);
    }
  }, []);

  // Save scroll position before navigating away (detail page, back button)
  useEffect(() => {
    const saveScroll = () => sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
    window.addEventListener('beforeunload', saveScroll);
    // Also capture click-based navigation on escrow card links
    const listEl = listRef.current;
    if (listEl) listEl.addEventListener('click', saveScroll, { capture: true });
    return () => {
      window.removeEventListener('beforeunload', saveScroll);
      if (listEl) listEl.removeEventListener('click', saveScroll, { capture: true });
    };
  }, []);

  // Sentinel element triggers next page load
  const { ref: sentinelRef, isIntersecting } = useIntersectionObserver({
    rootMargin: '200px',
    threshold: 0,
    triggerOnce: false,
  });

  useEffect(() => {
    if (isIntersecting && hasMore && !loading) {
      fetchNext();
    }
  }, [isIntersecting, hasMore, loading, fetchNext]);

  const handleFilterChange = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSearch('');
    setDebouncedSearch('');
  }, []);

  const activeFilterCount =
    filters.statuses.length +
    (filters.minAmount ? 1 : 0) +
    (filters.maxAmount ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.sort !== 'createdAt:desc' ? 1 : 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Escrow Explorer</h1>
        <p className="text-gray-400 mt-1">Browse all public escrow agreements.</p>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search by escrow ID or address..."
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2.5 text-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border bg-gray-900 border-gray-800 text-gray-300"
        >
          <SlidersHorizontal size={15} />
          Filters
          {activeFilterCount > 0 && <span className="text-xs">{activeFilterCount}</span>}
        </button>
      </div>

      <div className={`flex gap-6 ${showFilters ? 'items-start' : ''}`}>
        {showFilters && (
          <div className="w-56 flex-shrink-0 card">
            <SearchFilters filters={filters} onChange={handleFilterChange} onReset={handleReset} />
          </div>
        )}

        <div className="flex-1 min-w-0" ref={listRef}>
          {initialLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
              <Spinner />
              <p className="text-sm">Loading escrows...</p>
            </div>
          ) : error && escrows.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-red-400 mb-3">Failed to load escrows</p>
              <p className="text-gray-500 text-sm">{error}</p>
            </div>
          ) : escrows.length === 0 ? (
            <EmptyState
              title="No escrows found"
              description="No escrows match your current criteria."
              actionLabel={activeFilterCount > 0 ? 'Clear all filters' : 'Create Escrow'}
              onAction={activeFilterCount > 0 ? handleReset : undefined}
              actionHref={activeFilterCount > 0 ? undefined : '/escrow/create'}
            />
          ) : (
            <>
              <div
                className={`grid gap-4 ${showFilters ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'}`}
              >
                {escrows.map((escrow) => (
                  <EscrowCard key={escrow.id} escrow={escrow} />
                ))}
              </div>

              {/* Sentinel for IntersectionObserver — must sit below last card */}
              <div ref={sentinelRef} data-testid="scroll-sentinel" className="h-1" aria-hidden="true" />

              {/* Bottom state — aria-live so screen readers announce updates */}
              <div
                aria-live="polite"
                aria-atomic="true"
                className="flex justify-center py-8 text-sm text-gray-500"
              >
                {loading && (
                  <span className="flex items-center gap-2">
                    <Spinner size="sm" />
                    Loading more...
                  </span>
                )}
                {!loading && !hasMore && escrows.length > 0 && (
                  <span>All escrows loaded</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ExplorerPage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
            <Spinner />
            <p className="text-sm">Loading escrows...</p>
          </div>
        }
      >
        <ExplorerContent />
      </Suspense>
    </ErrorBoundary>
  );
}
