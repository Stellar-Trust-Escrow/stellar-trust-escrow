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
    retry: 1,
  });
}

export function useEscrowList(params?: Record<string, string | number>) {
  return useQuery({
    queryKey: ['escrows', params],
    queryFn: async () => {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        return { data: getCachedEscrows() as Escrow[], total: 0, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPreviousPage: false };
      }
      const { data } = await escrowApi.list(params);
      data.data.forEach((e) => cacheEscrow(e as unknown as Record<string, unknown>));
      return data;
    },
    staleTime: 15_000,
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
