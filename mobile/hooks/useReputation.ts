import { useQuery } from '@tanstack/react-query';
import { reputationApi } from '../lib/api';

export function useReputation(address: string | null) {
  return useQuery({
    queryKey: ['reputation', address],
    queryFn: async () => {
      const { data } = await reputationApi.get(address!);
      return data;
    },
    enabled: !!address,
    staleTime: 30_000,
  });
}

export function useLeaderboard(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['leaderboard', page, limit],
    queryFn: async () => {
      const { data } = await reputationApi.leaderboard({ page, limit });
      return data;
    },
    staleTime: 60_000,
  });
}

/** Maps a reputation score to a badge label. Mirrors backend logic. */
export function getReputationBadge(score: number): { label: string; color: string } {
  if (score >= 1000) return { label: 'ELITE', color: '#f59e0b' };
  if (score >= 500) return { label: 'EXPERT', color: '#8b5cf6' };
  if (score >= 250) return { label: 'VERIFIED', color: '#6366f1' };
  if (score >= 100) return { label: 'TRUSTED', color: '#10b981' };
  return { label: 'NEW', color: '#6b7280' };
}
