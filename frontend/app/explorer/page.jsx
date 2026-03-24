/**
 * Public Explorer Page — /explorer
 *
 * Browse all escrows with advanced search, filtering, sorting, and pagination.
 * Filter state is synced to URL query params so results are shareable.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import EscrowCard from '../../components/escrow/EscrowCard';
import SearchFilters from '../../components/explorer/SearchFilters';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const DEFAULT_FILTERS = {
  statuses: [],
  minAmount: '',
  maxAmount: '',
  dateFrom: '',
  dateTo: '',
  sort: 'createdAt:desc',
};

/** Normalise a raw API escrow record into the shape EscrowCard expects */
function normaliseEscrow(e) {
  return {
    id: String(e.id),
    // API doesn't store a title — use a derived label
    title: `Escrow #${e.id}`,
    status: e.status,
    totalAmount: `${Number(e.totalAmount).toLocaleString()} USDC`,
    milestoneProgress: '— / —',
    counterparty: e.clientAddress
      ? `${e.clientAddress.slice(0, 4)}…${e.clientAddress.slice(-4)}`
      : '—',
    role: 'client',
  };
}

/** Build the API query string from current filter + pagination state */
function buildQuery({ search, filters, page, limit }) {
  const params = new URLSearchParams();
  params.set('page', page);
  params.set('limit', limit);

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

/** Read initial filter state from URL search params */
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

export default function ExplorerPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── State ──────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [filters, setFilters] = useState(() => filtersFromUrl(searchParams));
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));
  const [showFilters, setShowFilters] = useState(false);

  const [escrows, setEscrows] = useState([]);
  const [meta, setMeta] = useState({ total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Debounce search input (300 ms) ─────────────────────────────────────────
  const debounceTimer = useRef(null);
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceTimer.current);
  }, [search]);

  // ── Sync state → URL ───────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (filters.statuses.length) params.set('status', filters.statuses.join(','));
    if (filters.minAmount) params.set('minAmount', filters.minAmount);
    if (filters.maxAmount) params.set('maxAmount', filters.maxAmount);
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    const [sortBy, sortOrder] = filters.sort.split(':');
    if (sortBy !== 'createdAt' || sortOrder !== 'desc') {
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
    }
    if (page > 1) params.set('page', page);
    router.replace(`/explorer?${params.toString()}`, { scroll: false });
  }, [debouncedSearch, filters, page, router]);

  // ── Fetch escrows ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const qs = buildQuery({ search: debouncedSearch, filters, page, limit: PAGE_SIZE });
    fetch(`${API_BASE}/api/escrows?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`);
        return r.json();
      })
      .then(({ data, total, totalPages, hasNextPage, hasPreviousPage }) => {
        if (cancelled) return;
        setEscrows((data || []).map(normaliseEscrow));
        setMeta({ total: total || 0, totalPages: totalPages || 0, hasNextPage, hasPreviousPage });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [debouncedSearch, filters, page]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleFilterChange = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSearch('');
    setDebouncedSearch('');
    setPage(1);
  }, []);

  const activeFilterCount =
    filters.statuses.length +
    (filters.minAmount ? 1 : 0) +
    (filters.maxAmount ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.sort !== 'createdAt:desc' ? 1 : 0);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Escrow Explorer</h1>
        <p className="text-gray-400 mt-1">
          Browse all public escrow agreements on StellarTrustEscrow.
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 text-center text-sm">
        <div className="card py-3">
          <p className="text-gray-500">Total Escrows</p>
          <p className="text-white font-bold text-lg">
            {loading ? '—' : meta.total.toLocaleString()}
          </p>
        </div>
        <div className="card py-3">
          <p className="text-gray-500">Page</p>
          <p className="text-white font-bold text-lg">
            {loading ? '—' : `${page} / ${meta.totalPages || 1}`}
          </p>
        </div>
        <div className="card py-3">
          <p className="text-gray-500">Showing</p>
          <p className="text-white font-bold text-lg">
            {loading ? '—' : `${escrows.length} results`}
          </p>
        </div>
      </div>

      {/* Search bar + filter toggle */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search by escrow ID or address…"
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2.5
                       text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500
                       transition-colors text-sm"
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
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium
            transition-colors
            ${
              showFilters || activeFilterCount > 0
                ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
            }`}
        >
          <SlidersHorizontal size={15} />
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-indigo-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.statuses.map((s) => (
            <span
              key={s}
              className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-full
                         px-3 py-1 text-xs text-gray-300"
            >
              <Badge status={s} size="sm" />
              <button
                onClick={() => handleFilterChange('statuses', filters.statuses.filter((x) => x !== s))}
                className="text-gray-500 hover:text-white ml-0.5"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          {(filters.minAmount || filters.maxAmount) && (
            <span className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-full px-3 py-1 text-xs text-gray-300">
              {filters.minAmount && `≥ ${filters.minAmount}`}
              {filters.minAmount && filters.maxAmount && ' – '}
              {filters.maxAmount && `≤ ${filters.maxAmount}`} USDC
              <button
                onClick={() => { handleFilterChange('minAmount', ''); handleFilterChange('maxAmount', ''); }}
                className="text-gray-500 hover:text-white ml-0.5"
              >
                <X size={11} />
              </button>
            </span>
          )}
          {(filters.dateFrom || filters.dateTo) && (
            <span className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-full px-3 py-1 text-xs text-gray-300">
              {filters.dateFrom || '…'} → {filters.dateTo || '…'}
              <button
                onClick={() => { handleFilterChange('dateFrom', ''); handleFilterChange('dateTo', ''); }}
                className="text-gray-500 hover:text-white ml-0.5"
              >
                <X size={11} />
              </button>
            </span>
          )}
          <button
            onClick={handleReset}
            className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Main layout: optional filter sidebar + results */}
      <div className={`flex gap-6 ${showFilters ? 'items-start' : ''}`}>
        {/* Filter sidebar */}
        {showFilters && (
          <div className="w-56 flex-shrink-0 card">
            <SearchFilters filters={filters} onChange={handleFilterChange} onReset={handleReset} />
          </div>
        )}

        {/* Results */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <Loader2 size={24} className="animate-spin mr-2" />
              Loading escrows…
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-red-400 mb-3">Failed to load escrows</p>
              <p className="text-gray-500 text-sm">{error}</p>
            </div>
          ) : escrows.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg mb-2">No escrows found</p>
              <p className="text-sm">Try adjusting your search or filters.</p>
              {activeFilterCount > 0 && (
                <button
                  onClick={handleReset}
                  className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className={`grid gap-4 ${showFilters ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
              {escrows.map((escrow) => (
                <EscrowCard key={escrow.id} escrow={escrow} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {!loading && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!meta.hasPreviousPage}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={14} />
            Prev
          </Button>

          {/* Page number pills */}
          <div className="flex gap-1">
            {Array.from({ length: Math.min(meta.totalPages, 7) }, (_, i) => {
              // Show pages around current page
              const total = meta.totalPages;
              let pageNum;
              if (total <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i < 6 ? i + 1 : total;
              } else if (page >= total - 3) {
                pageNum = i === 0 ? 1 : total - 6 + i;
              } else {
                const offsets = [1, page - 2, page - 1, page, page + 1, page + 2, total];
                pageNum = offsets[i];
              }
              const isEllipsis =
                total > 7 &&
                ((i === 1 && pageNum > 2) || (i === 5 && pageNum < total - 1));

              if (isEllipsis) {
                return (
                  <span key={i} className="px-2 py-1 text-sm text-gray-600 select-none">
                    …
                  </span>
                );
              }

              return (
                <button
                  key={i}
                  onClick={() => setPage(pageNum)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors
                    ${
                      pageNum === page
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <Button
            variant="secondary"
            size="sm"
            disabled={!meta.hasNextPage}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
            <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}
