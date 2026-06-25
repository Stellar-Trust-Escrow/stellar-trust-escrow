import { useState, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { getCachedEscrows, cacheEscrow, type Escrow } from '../services/offlineCache';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

export interface EscrowListParams {
  status?: string;
  limit?: number;
  offset?: number;
}

interface UseEscrowListResult {
  escrows: Escrow[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

function applyOfflineFilters(escrows: Escrow[], params: EscrowListParams): Escrow[] {
  let filtered = escrows;

  if (params.status) {
    filtered = filtered.filter((e) => e.status === params.status);
  }

  const total = filtered.length;
  const offset = params.offset ?? 0;
  const limit = params.limit ?? 20;

  filtered = filtered.slice(offset, offset + limit);

  Object.defineProperty(filtered, '_total', { value: total, enumerable: false });
  return filtered;
}

export function useEscrowList(params: EscrowListParams = {}): UseEscrowListResult {
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchEscrows = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const netState = await NetInfo.fetch();

      if (!netState.isConnected) {
        const cached = getCachedEscrows('escrow');
        const filtered = applyOfflineFilters(cached, params);
        const filteredTotal =
          (filtered as unknown as { _total?: number })._total ?? filtered.length;
        setEscrows(filtered);
        setTotal(filteredTotal);
        return;
      }

      const query = new URLSearchParams();
      if (params.status) query.set('status', params.status);
      if (params.limit) query.set('limit', String(params.limit));
      if (params.offset) query.set('offset', String(params.offset));

      const res = await fetch(`${API_URL}/api/escrows?${query.toString()}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);

      const data = await res.json();
      const fetchedEscrows: Escrow[] = data.escrows ?? data;
      const fetchedTotal: number = data.total ?? fetchedEscrows.length;

      for (const escrow of fetchedEscrows) {
        cacheEscrow(escrow, 'escrow');
      }

      setEscrows(fetchedEscrows);
      setTotal(fetchedTotal);
    } catch (err) {
      const cached = getCachedEscrows('escrow');
      const filtered = applyOfflineFilters(cached, params);
      const filteredTotal =
        (filtered as unknown as { _total?: number })._total ?? filtered.length;
      setEscrows(filtered);
      setTotal(filteredTotal);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [params.status, params.limit, params.offset]);

  useEffect(() => {
    fetchEscrows();
  }, [fetchEscrows]);

  return { escrows, total, isLoading, error, refetch: fetchEscrows };
/**
 * Escrow data hooks using React Query.
 * Falls back to SQLite offline cache when network is unavailable.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { escrowApi, userApi, type Escrow, type Milestone } from '../lib/api';
import {
  cacheEscrow,
  getCachedEscrow,
  getCachedEscrows,
  cacheMilestones,
  getCachedMilestones,
} from '../services/offlineCache';

// Exponential backoff: 500ms, 1000ms, capped at 10s
const RETRY_BASE_DELAY_MS = 500;
const retryDelay = (attempt: number) => Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, 10_000);

export function useEscrow(id: string | null) {
  return useQuery({
    queryKey: ['escrow', id],
    queryFn: async () => {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        const cached = id ? getCachedEscrow(id) : null;
        if (cached) return cached as Escrow;
        throw new Error('No network connection and no cached data.');
      }
      const { data } = await escrowApi.get(id!);
      cacheEscrow(data as unknown as Record<string, unknown>);
      return data;
    },
    enabled: !!id,
    staleTime: 10_000,
    gcTime: 5 * 60_000,
    retry: 2,
    retryDelay,
  });
}

export function useEscrowList(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['escrows', params],
    queryFn: async () => {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        const status = params?.status as string | undefined;
        const limit = typeof params?.limit === 'number' ? params.limit : 20;
        const offset = typeof params?.offset === 'number' ? params.offset : 0;

        let offline = getCachedEscrows() as Escrow[];
        if (status) {
          offline = offline.filter((e) => e.status === status);
        }
        const paged = offline.slice(offset, offset + limit);

        return {
          data: paged,
          total: offline.length,
          page: Math.floor(offset / limit) + 1,
          limit,
          totalPages: Math.max(1, Math.ceil(offline.length / limit)),
          hasNextPage: offset + limit < offline.length,
          hasPreviousPage: offset > 0,
        };
      }
      const { data } = await escrowApi.list(params);
      data.data.forEach((e) => cacheEscrow(e as unknown as Record<string, unknown>));
      return data;
    },
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    retry: 2,
    retryDelay,
    refetchOnWindowFocus: false,
  });
}

export function useUserEscrows(address: string | null, role?: string) {
  return useQuery({
    queryKey: ['user-escrows', address, role],
    queryFn: async () => {
      const { data } = await userApi.getEscrows(address!, role ? { role } : undefined);
      return data;
    },
    enabled: !!address,
    staleTime: 15_000,
  });
}

export function useMilestones(escrowId: string | null) {
  return useQuery({
    queryKey: ['milestones', escrowId],
    queryFn: async () => {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        return getCachedMilestones(escrowId!) as Milestone[];
      }
      const { data } = await escrowApi.getMilestones(escrowId!);
      cacheMilestones(escrowId!, data.data as unknown as Record<string, unknown>[]);
      return data.data;
    },
    enabled: !!escrowId,
    staleTime: 10_000,
  });
}

export function useBroadcastEscrow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (signedXdr: string) => escrowApi.broadcast(signedXdr).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escrows'] });
    },
  });
}
