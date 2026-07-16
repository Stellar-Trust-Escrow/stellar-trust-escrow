'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import Spinner from '../../components/ui/Spinner';
import EscrowCard from '../../components/escrow/EscrowCard';
import SearchFilters from '../../components/explorer/SearchFilters';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import ErrorBoundary from '../../components/error/ErrorBoundary';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const DEFAULT_FILTERS = {
  statuses: [],
  minAmount: '',
  maxAmount: '',
  dateFrom: '',
  dateTo: '',
  sort: 'createdAt:desc',
};

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

function buildQuery({ search, filters, page, limit }) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  if (search) params.set('search', search);
  if (filters.statuses.length) params.set('status', filters.statuses.join(','));
  if (filters.minAmount) params.set('minAmount', filters.minAmount);
  if (filters.maxAmount) params.set('maxAmount', filters.maxAmount);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  const [sortBy, sortOrder] = filters.sort.split(':');
  params.set('sortBy', sortBy);
  params.set('sortOrder', sortOrder);
  return params.toString();
}

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

const PAGE_SIZE = 12;

function ExplorerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [filters, setFilters] = useState(() => filtersFromUrl(searchParams));
  const [showFilters, setShowFilters] = useState(false);

  const debounceTimer = useRef(null);
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(debounceTimer.current);
  }, [search]);

  // Keep the URL in sync so search is shareable / restorable (no page param,
  // since position is now scroll-driven rather than page-driven).
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    router.replace(`/explorer?${params.toString()}`, { scroll: false });
  }, [debouncedSearch, router]);

  // Fetch a single page of results for the infinite-scroll hook.
  const fetchPage = useCallback(
    async (pageNum, limit) => {
      const qs = buildQuery({ search: debouncedSearch, filters, page: pageNum, limit });
      const res = await fetch(`${API_BASE}/api/escrows?${qs}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const { data, hasNextPage } = await res.json();
      return { items: (data || []).map(normaliseEscrow), hasNextPage };
    },
    [debouncedSearch, filters],
  );

  const {
    items: escrows,
    loading: initialLoading,
    loadingMore,
    error,
    hasNextPage,
    sentinelRef,
    loadMore,
    reset,
  } = useInfiniteScroll({
    fetchPage,
    limit: PAGE_SIZE,
    deps: [debouncedSearch, filters],
  });

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
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          aria-controls="explorer-filters"
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border bg-gray-900 border-gray-800 text-gray-300"
        >
          <SlidersHorizontal size={15} />
          Filters
          {activeFilterCount > 0 && (
            <span className="text-xs bg-indigo-600 text-white rounded-full px-1.5 py-0.5">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      <div className={`flex gap-6 ${showFilters ? 'items-start' : ''}`}>
        {showFilters && (
          <div id="explorer-filters" className="w-56 flex-shrink-0 card">
            <SearchFilters filters={filters} onChange={handleFilterChange} onReset={handleReset} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          {initialLoading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-gray-400">
              <Spinner />
              <p className="text-sm">Loading escrows…</p>
            </div>
          ) : error ? (
            <div role="alert" className="text-center py-16 card border-red-500/30 bg-red-500/10">
              <p className="text-red-400 mb-3">Failed to load escrows</p>
              <p className="text-gray-500 text-sm mb-4">{error}</p>
              <Button variant="secondary" size="sm" onClick={reset}>
                Try again
              </Button>
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
              {/* WAI-ARIA feed pattern: a scrollable stream of articles.
                  aria-busy communicates background loading to assistive tech. */}
              <div
                role="feed"
                aria-busy={loadingMore}
                aria-label="Escrow results"
                className={`grid gap-4 ${showFilters ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'}`}
              >
                {escrows.map((escrow, index) => (
                  <article
                    key={escrow.id}
                    role="article"
                    aria-posinset={index + 1}
                    aria-setsize={-1}
                    aria-label={`Escrow ${escrow.title}`}
                  >
                    <EscrowCard escrow={escrow} />
                  </article>
                ))}
              </div>

              {/* Live region announces load progress to screen readers. */}
              <div aria-live="polite" className="sr-only">
                {loadingMore ? 'Loading more escrows…' : ''}
              </div>

              {hasNextPage ? (
                <div className="flex flex-col items-center gap-3 pt-6">
                  {loadingMore && <Spinner size="sm" />}
                  {/* Manual trigger — keyboard / screen-reader friendly
                      fallback to the scroll sentinel. */}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={loadMore}
                    disabled={loadingMore}
                    aria-label="Load more escrows"
                  >
                    {loadingMore ? (
                      'Loading…'
                    ) : (
                      <>
                        Load more
                        <ChevronDown size={14} />
                      </>
                    )}
                  </Button>
                  {/* Sentinel: observer fires loadMore as it nears the viewport. */}
                  <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
                </div>
              ) : (
                <p className="text-center text-sm text-gray-500 pt-6" role="status">
                  You&apos;ve reached the end of the list.
                </p>
              )}
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
            <p className="text-sm">Loading escrows…</p>
          </div>
        }
      >
        <ExplorerContent />
      </Suspense>
    </ErrorBoundary>
  );
}
