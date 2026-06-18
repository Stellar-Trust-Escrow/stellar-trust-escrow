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
