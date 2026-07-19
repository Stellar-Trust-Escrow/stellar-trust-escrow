import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Link2 } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';

const STATUSES = ['Active', 'Completed', 'Disputed', 'Cancelled'];

const SORT_OPTIONS = [
  { sort: 'createdAt', order: 'desc', label: 'Newest first' },
  { sort: 'createdAt', order: 'asc', label: 'Oldest first' },
  { sort: 'totalAmount', order: 'desc', label: 'Highest amount' },
  { sort: 'totalAmount', order: 'asc', label: 'Lowest amount' },
  { sort: 'status', order: 'asc', label: 'Status (A\u2013Z)' },
];

const inputCls =
  'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white ' +
  'placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors';

const labelCls = 'block text-xs font-medium text-gray-400 mb-1.5';

export default function SearchFilters({ filters, onFilterChange, onReset, onCopyLink, activeFilterCount }) {
  const { showToast } = useToast();

  const [localSearch, setLocalSearch] = useState(filters.q);
  const [localMinAmount, setLocalMinAmount] = useState(filters.amount_min ? String(filters.amount_min) : '');
  const [localMaxAmount, setLocalMaxAmount] = useState(filters.amount_max ? String(filters.amount_max) : '');
  const [amountError, setAmountError] = useState('');

  const searchTimer = useRef(null);
  const minAmountTimer = useRef(null);
  const maxAmountTimer = useRef(null);

  useEffect(() => {
    setLocalSearch(filters.q);
  }, [filters.q]);

  useEffect(() => {
    setLocalMinAmount(filters.amount_min ? String(filters.amount_min) : '');
  }, [filters.amount_min]);

  useEffect(() => {
    setLocalMaxAmount(filters.amount_max ? String(filters.amount_max) : '');
  }, [filters.amount_max]);

  const debouncedSetQ = useCallback(
    (value) => {
      clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        onFilterChange('q', value || null, { history: 'replace' });
      }, 300);
    },
    [onFilterChange],
  );

  const validateAndSetAmount = useCallback(
    (key, localKey, value, timerRef) => {
      clearTimeout(timerRef.current);
      const numVal = value === '' ? 0 : parseInt(value, 10);
      if (value !== '' && (isNaN(numVal) || numVal < 0)) return;

      if (localKey === 'localMinAmount') {
        setLocalMinAmount(value);
        const maxVal = key === 'amount_min' ? numVal : filters.amount_max;
        if (numVal > 0 && maxVal > 0 && numVal > maxVal) {
          setAmountError('Min cannot exceed max');
          return;
        }
      } else {
        setLocalMaxAmount(value);
        const minVal = key === 'amount_max' ? numVal : filters.amount_min;
        if (numVal > 0 && minVal > 0 && numVal < minVal) {
          setAmountError('Max cannot be less than min');
          return;
        }
      }
      setAmountError('');

      timerRef.current = setTimeout(() => {
        onFilterChange(key, numVal || null, { history: 'replace' });
      }, 300);
    },
    [onFilterChange, filters.amount_min, filters.amount_max],
  );

  useEffect(() => {
    return () => {
      clearTimeout(searchTimer.current);
      clearTimeout(minAmountTimer.current);
      clearTimeout(maxAmountTimer.current);
    };
  }, []);

  function toggleStatus(status) {
    const next = filters.status.includes(status)
      ? filters.status.filter((s) => s !== status)
      : [...filters.status, status];
    onFilterChange('status', next.length > 0 ? next : null, { history: 'push' });
  }

  function handleSortChange(e) {
    const opt = SORT_OPTIONS.find((o) => `${o.sort}:${o.order}` === e.target.value);
    if (opt) {
      onFilterChange('sort', opt.sort, { history: 'push' });
      onFilterChange('order', opt.order, { history: 'push' });
    }
  }

  function handleDateFromChange(e) {
    onFilterChange('date_from', e.target.value || null, { history: 'push' });
  }

  function handleDateToChange(e) {
    onFilterChange('date_to', e.target.value || null, { history: 'push' });
  }

  async function handleCopyLink() {
    if (onCopyLink) {
      await onCopyLink();
      showToast('Filter link copied!', 'success');
    }
  }

  function handleReset() {
    setLocalSearch('');
    setLocalMinAmount('');
    setLocalMaxAmount('');
    setAmountError('');
    onReset();
  }

  const currentSortValue = `${filters.sort}:${filters.order}`;

  return (
    <aside className="w-full space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">Filters</h2>
          <button
            onClick={handleCopyLink}
            title="Share filters"
            className="text-gray-500 hover:text-indigo-400 transition-colors"
          >
            <Link2 size={14} />
          </button>
        </div>
        {activeFilterCount > 0 && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <X size={12} />
            Clear all
          </button>
        )}
      </div>

      <div>
        <p className={labelCls}>Status</p>
        <div className="flex flex-col gap-1.5">
          {STATUSES.map((s) => {
            const active = filters.status.includes(s);
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

      <div>
        <p className={labelCls}>Amount range (USDC)</p>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            placeholder="Min"
            className={inputCls}
            value={localMinAmount}
            onChange={(e) => validateAndSetAmount('amount_min', 'localMinAmount', e.target.value, minAmountTimer)}
          />
          <input
            type="number"
            min="0"
            placeholder="Max"
            className={inputCls}
            value={localMaxAmount}
            onChange={(e) => validateAndSetAmount('amount_max', 'localMaxAmount', e.target.value, maxAmountTimer)}
          />
        </div>
        {amountError && <p className="text-xs text-red-400 mt-1">{amountError}</p>}
      </div>

      <div>
        <p className={labelCls}>Date range</p>
        <div className="space-y-2">
          <input
            type="date"
            className={inputCls}
            value={filters.date_from}
            onChange={handleDateFromChange}
          />
          <input
            type="date"
            className={inputCls}
            value={filters.date_to}
            onChange={handleDateToChange}
          />
        </div>
      </div>

      <div>
        <p className={labelCls}>Sort by</p>
        <select
          className={inputCls}
          value={currentSortValue}
          onChange={handleSortChange}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={`${o.sort}:${o.order}`} value={`${o.sort}:${o.order}`}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </aside>
  );
}
