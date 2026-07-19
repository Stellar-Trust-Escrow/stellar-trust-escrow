'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const STATUSES = ['Active', 'Completed', 'Disputed', 'Cancelled'];

export default function EscrowFilters({ onFiltersChange }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [status, setStatus] = useState(
    searchParams.get('status')?.split(',').filter(Boolean) || [],
  );
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '');
  const [amountMin, setAmountMin] = useState(searchParams.get('amountMin') || '');
  const [amountMax, setAmountMax] = useState(searchParams.get('amountMax') || '');

  const hasActiveFilters =
    search || status.length > 0 || dateFrom || dateTo || amountMin || amountMax;

  const activeFilterCount = [
    search ? 1 : 0,
    status.length ? 1 : 0,
    dateFrom || dateTo ? 1 : 0,
    amountMin || amountMax ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const updateUrlParams = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (status.length > 0) params.set('status', status.join(','));
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (amountMin) params.set('amountMin', amountMin);
    if (amountMax) params.set('amountMax', amountMax);

    const url = params.toString() ? `?${params.toString()}` : '';
    router.push(url);

    onFiltersChange?.({
      search,
      status,
      dateFrom,
      dateTo,
      amountMin,
      amountMax,
    });
  }, [search, status, dateFrom, dateTo, amountMin, amountMax, router, onFiltersChange]);

  useEffect(() => {
    const timer = setTimeout(updateUrlParams, 300);
    return () => clearTimeout(timer);
  }, [search, status, dateFrom, dateTo, amountMin, amountMax, updateUrlParams]);

  const toggleStatus = (s) => {
    setStatus((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const clearFilters = () => {
    setSearch('');
    setStatus([]);
    setDateFrom('');
    setDateTo('');
    setAmountMin('');
    setAmountMax('');
  };

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg" data-testid="escrow-filters">
      {/* Search Bar */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
        <input
          type="text"
          placeholder="Escrow ID or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
          data-testid="search-input"
        />
      </div>

      {/* Status Filter */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                status.includes(s)
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              data-testid={`status-${s}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Date Range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            data-testid="date-from"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            data-testid="date-to"
          />
        </div>
      </div>

      {/* Amount Range */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Min Amount</label>
          <input
            type="number"
            placeholder="0"
            value={amountMin}
            onChange={(e) => setAmountMin(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            data-testid="amount-min"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Max Amount</label>
          <input
            type="number"
            placeholder="∞"
            value={amountMax}
            onChange={(e) => setAmountMax(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
            data-testid="amount-max"
          />
        </div>
      </div>

      {/* Filter Badge and Clear */}
      <div className="flex items-center justify-between pt-2">
        {hasActiveFilters && (
          <span
            className="text-sm font-medium text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full"
            data-testid="filter-badge"
          >
            {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
          </span>
        )}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-sm text-red-600 hover:text-red-700 font-medium focus-visible:ring-2 focus-visible:ring-red-500 rounded px-2"
            data-testid="clear-filters"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
