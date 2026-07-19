import { useCallback, useMemo } from 'react';
import {
  useQueryStates,
  parseAsString,
  parseAsInteger,
  parseAsArrayOf,
  parseAsStringLiteral,
  type Options,
} from 'nuqs';

const SORT_KEYS = ['createdAt', 'totalAmount', 'status'] as const;
const SORT_ORDERS = ['asc', 'desc'] as const;

const VALID_STATUSES = ['Active', 'Completed', 'Disputed', 'Cancelled'] as const;

const parsers = {
  q: parseAsString.withDefault(''),
  status: parseAsArrayOf(parseAsString).withDefault([]),
  amount_min: parseAsInteger.withDefault(0),
  amount_max: parseAsInteger.withDefault(0),
  date_from: parseAsString.withDefault(''),
  date_to: parseAsString.withDefault(''),
  sort: parseAsStringLiteral(SORT_KEYS).withDefault('createdAt'),
  order: parseAsStringLiteral(SORT_ORDERS).withDefault('desc'),
  page: parseAsInteger.withDefault(1),
};

type SortKey = (typeof SORT_KEYS)[number];
type SortOrder = (typeof SORT_ORDERS)[number];

type EscrowFilterValues = {
  q: string;
  status: string[];
  amount_min: number;
  amount_max: number;
  date_from: string;
  date_to: string;
  sort: (typeof SORT_KEYS)[number];
  order: (typeof SORT_ORDERS)[number];
  page: number;
};

type UseEscrowFilterParamsReturn = {
  filters: EscrowFilterValues;
  setFilter: <K extends keyof EscrowFilterParamsMap>(
    key: K,
    value: EscrowFilterParamsMap[K],
    options?: Options,
  ) => Promise<URLSearchParams>;
  setFilters: (values: Partial<EscrowFilterValues>, options?: Options) => Promise<URLSearchParams>;
  resetFilters: () => Promise<URLSearchParams>;
  copyFilterUrl: () => Promise<void>;
  activeFilterCount: number;
  apiQueryString: string;
};

type EscrowFilterParamsMap = {
  q: string;
  status: string[];
  amount_min: number;
  amount_max: number;
  date_from: string;
  date_to: string;
  sort: SortKey;
  order: SortOrder;
  page: number;
};

const replaceOptions: Options = { history: 'replace' };
const pushOptions: Options = { history: 'push' };

export function useEscrowFilterParams(): UseEscrowFilterParamsReturn {
  const [filters, setFiltersState] = useQueryStates(parsers, replaceOptions);

  const setFilter = useCallback(
    <K extends keyof EscrowFilterParamsMap>(
      key: K,
      value: EscrowFilterParamsMap[K],
      options?: Options,
    ) => {
      const opts = options ?? pushOptions;
      return setFiltersState({ [key]: value }, opts);
    },
    [setFiltersState],
  );

  const setFilters = useCallback(
    (values: Partial<EscrowFilterValues>, options?: Options) => {
      return setFiltersState(values, options ?? pushOptions);
    },
    [setFiltersState],
  );

  const resetFilters = useCallback(() => {
    return setFiltersState(
      {
        q: null,
        status: null,
        amount_min: null,
        amount_max: null,
        date_from: null,
        date_to: null,
        sort: 'createdAt',
        order: 'desc',
        page: null,
      },
      pushOptions,
    );
  }, [setFiltersState]);

  const copyFilterUrl = useCallback(async () => {
    const url = window.location.href;
    await navigator.clipboard.writeText(url);
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.q) count++;
    if (filters.status.length > 0) count++;
    if (filters.amount_min > 0) count++;
    if (filters.amount_max > 0) count++;
    if (filters.date_from) count++;
    if (filters.date_to) count++;
    if (filters.sort !== 'createdAt') count++;
    if (filters.order !== 'desc') count++;
    return count;
  }, [filters]);

  const apiQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.q) params.set('search', filters.q);
    if (filters.status.length > 0) params.set('status', filters.status.join(','));
    if (filters.amount_min > 0) params.set('minAmount', String(filters.amount_min));
    if (filters.amount_max > 0) params.set('maxAmount', String(filters.amount_max));
    if (filters.date_from) params.set('dateFrom', filters.date_from);
    if (filters.date_to) params.set('dateTo', filters.date_to);
    params.set('sortBy', filters.sort);
    params.set('sortOrder', filters.order);
    if (filters.page > 1) params.set('page', String(filters.page));
    params.set('limit', '12');
    return params.toString();
  }, [filters]);

  return {
    filters,
    setFilter,
    setFilters,
    resetFilters,
    copyFilterUrl,
    activeFilterCount,
    apiQueryString,
  };
}

export { parsers as escrowFilterParsers, VALID_STATUSES };
export type { EscrowFilterValues, EscrowFilterParamsMap };
