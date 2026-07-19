import useSWR from 'swr';
import api from '../lib/api/client';

const fetcher = (url: string) => api.get(url).then(res => res.data);

export function useVolumeAnalytics(from: string, to: string, granularity: 'day' | 'week' | 'month' = 'day') {
  const { data, error, isLoading } = useSWR(
    from && to ? `/v1/admin/analytics/volume?from=${from}&to=${to}&granularity=${granularity}` : null,
    fetcher
  );

  return {
    data,
    isLoading,
    isError: error
  };
}

export function useDisputeRateAnalytics(from: string, to: string, granularity: 'day' | 'week' | 'month' = 'day') {
  const { data, error, isLoading } = useSWR(
    from && to ? `/v1/admin/analytics/dispute-rate?from=${from}&to=${to}&granularity=${granularity}` : null,
    fetcher
  );

  return {
    data,
    isLoading,
    isError: error
  };
}

export function useResolutionTimeAnalytics(from: string, to: string) {
  const { data, error, isLoading } = useSWR(
    from && to ? `/v1/admin/analytics/resolution-time?from=${from}&to=${to}` : null,
    fetcher
  );

  return {
    data,
    isLoading,
    isError: error
  };
}

export function useCohortAnalytics(cohortMonth: string) {
  const { data, error, isLoading } = useSWR(
    cohortMonth ? `/v1/admin/analytics/cohort?cohort_month=${cohortMonth}` : null,
    fetcher
  );

  return {
    data,
    isLoading,
    isError: error
  };
}
