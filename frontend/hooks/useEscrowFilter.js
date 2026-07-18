import { useState, useMemo } from 'react';

const DEFAULT_FILTERS = {
  status: '',
  search: '',
  minAmount: '',
  maxAmount: '',
  dateFrom: '',
  dateTo: '',
};

export function useEscrowFilter(escrows = []) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const filtered = useMemo(() => {
    return escrows.filter((e) => {
      if (filters.status && e.status !== filters.status) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const matches =
          e.id?.toLowerCase().includes(q) ||
          e.counterparty?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (filters.minAmount && Number(e.amount) < Number(filters.minAmount)) return false;
      if (filters.maxAmount && Number(e.amount) > Number(filters.maxAmount)) return false;
      if (filters.dateFrom && new Date(e.createdAt) < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && new Date(e.createdAt) > new Date(filters.dateTo)) return false;
      return true;
    });
  }, [escrows, filters]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const resetFilters = () => setFilters(DEFAULT_FILTERS);
  const activeCount = Object.values(filters).filter(Boolean).length;

  return { filters, filtered, setFilter, resetFilters, activeCount };
}
