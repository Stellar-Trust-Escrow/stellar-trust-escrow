/**
 * SearchFilters — sidebar filter panel for the Escrow Explorer.
 *
 * Props:
 *   filters  {object}   current filter state
 *   onChange {function} called with (key, value) on any change
 *   onReset  {function} clears all filters
 */

import { X } from 'lucide-react';

const STATUSES = ['Active', 'Completed', 'Disputed', 'Cancelled'];

const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'totalAmount:desc', label: 'Highest amount' },
  { value: 'totalAmount:asc', label: 'Lowest amount' },
  { value: 'status:asc', label: 'Status (A–Z)' },
];

const inputCls =
  'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white ' +
  'placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors';

const labelCls = 'block text-xs font-medium text-gray-400 mb-1.5';

export default function SearchFilters({ filters, onChange, onReset }) {
  const hasActiveFilters =
    filters.statuses.length > 0 ||
    filters.minAmount ||
    filters.maxAmount ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.sort !== 'createdAt:desc';

  function toggleStatus(status) {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange('statuses', next);
  }

  return (
    <aside className="w-full space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Filters</h2>
        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <X size={12} />
            Clear all
          </button>
        )}
      </div>

      {/* Status */}
      <div>
        <p className={labelCls}>Status</p>
        <div className="flex flex-col gap-1.5">
          {STATUSES.map((s) => {
            const active = filters.statuses.includes(s);
            return (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                  border transition-colors text-left
                  ${
                    active
                      ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                      : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                  }`}
              >
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    s === 'Active'
                      ? 'bg-indigo-400'
                      : s === 'Completed'
                        ? 'bg-emerald-400'
                        : s === 'Disputed'
                          ? 'bg-amber-400'
                          : 'bg-red-400'
                  }`}
                />
                {s}
                {active && <X size={12} className="ml-auto opacity-60" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Amount Range */}
      <div>
        <p className={labelCls}>Amount range (USDC)</p>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            placeholder="Min"
            className={inputCls}
            value={filters.minAmount}
            onChange={(e) => onChange('minAmount', e.target.value)}
          />
          <input
            type="number"
            min="0"
            placeholder="Max"
            className={inputCls}
            value={filters.maxAmount}
            onChange={(e) => onChange('maxAmount', e.target.value)}
          />
        </div>
      </div>

      {/* Date Range */}
      <div>
        <p className={labelCls}>Date range</p>
        <div className="space-y-2">
          <input
            type="date"
            className={inputCls}
            value={filters.dateFrom}
            onChange={(e) => onChange('dateFrom', e.target.value)}
          />
          <input
            type="date"
            className={inputCls}
            value={filters.dateTo}
            onChange={(e) => onChange('dateTo', e.target.value)}
          />
        </div>
      </div>

      {/* Sort */}
      <div>
        <p className={labelCls}>Sort by</p>
        <select
          className={inputCls}
          value={filters.sort}
          onChange={(e) => onChange('sort', e.target.value)}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}
