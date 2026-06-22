/**
 * API Client
 *
 * Axios instance pre-configured for the StellarTrustEscrow backend.
 * All requests automatically attach the stored auth token (Stellar address).
 */

import axios from 'axios';
import { storage } from './storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT as Bearer token on every request
api.interceptors.request.use(async (config) => {
  const jwt = await (async () => {
    try {
      const { secureStorage } = await import('./storage');
      return await secureStorage.get('auth_jwt');
    } catch {
      return null;
    }
  })();

  if (jwt) {
    config.headers.Authorization = `Bearer ${jwt}`;
  }
  return config;
});

// Handle 401: attempt silent re-auth
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const { useWalletStore } = await import('../store/useWalletStore');
        const { jwtAuth } = await import('../services/jwtAuth');

        const address = useWalletStore.getState().address;
        if (!address) throw new Error('No wallet connected');

        const newToken = await jwtAuth.silentRefresh(address);
        if (!newToken) throw new Error('Silent refresh failed');

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch {
        // Re-auth failed; caller should redirect to connect screen
        const { useWalletStore } = await import('../store/useWalletStore');
        useWalletStore.getState().disconnect();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

// ── Typed response helpers ────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface Escrow {
  id: string;
  clientAddress: string;
  freelancerAddress: string;
  arbiterAddress?: string;
  tokenAddress: string;
  totalAmount: string;
  remainingBalance: string;
  status: 'Active' | 'Completed' | 'Disputed' | 'Cancelled';
  briefHash: string;
  deadline?: string;
  createdAt: string;
  updatedAt: string;
  milestones?: Milestone[];
}

export interface Milestone {
  id: number;
  milestoneIndex: number;
  escrowId: string;
  title: string;
  descriptionHash: string;
  amount: string;
  status: 'Pending' | 'Submitted' | 'Approved' | 'Rejected';
  submittedAt?: string;
  resolvedAt?: string;
}

export interface ReputationRecord {
  address: string;
  totalScore: string;
  completedEscrows: number;
  disputedEscrows: number;
  disputesWon: number;
  totalVolume: string;
  lastUpdated: string;
}

export interface Dispute {
  id: number;
  escrowId: string;
  raisedByAddress: string;
  raisedAt: string;
  resolvedAt?: string;
  clientAmount?: string;
  freelancerAmount?: string;
  resolvedBy?: string;
  resolution?: string;
}

// ── API methods ───────────────────────────────────────────────────────────────

export const escrowApi = {
  list: (params?: Record<string, string | number>) =>
    api.get<PaginatedResponse<Escrow>>('/api/escrows', { params }),

  get: (id: string) => api.get<Escrow>(`/api/escrows/${id}`),

  getMilestones: (id: string, params?: Record<string, number>) =>
    api.get<PaginatedResponse<Milestone>>(`/api/escrows/${id}/milestones`, { params }),

  broadcast: (signedXdr: string) =>
    api.post<{ hash: string; status: string }>('/api/escrows/broadcast', { signedXdr }),
};

export const userApi = {
  get: (address: string) => api.get(`/api/users/${address}`),
  getEscrows: (address: string, params?: Record<string, string | number>) =>
    api.get<PaginatedResponse<Escrow>>(`/api/users/${address}/escrows`, { params }),
  getStats: (address: string) => api.get(`/api/users/${address}/stats`),
};

export const reputationApi = {
  get: (address: string) => api.get<ReputationRecord>(`/api/reputation/${address}`),
  leaderboard: (params?: Record<string, number>) =>
    api.get<PaginatedResponse<ReputationRecord>>('/api/reputation/leaderboard', { params }),
};

export const disputeApi = {
  list: (params?: Record<string, string | number>) =>
    api.get<PaginatedResponse<Dispute>>('/api/disputes', { params }),
  get: (escrowId: string) => api.get<Dispute>(`/api/disputes/${escrowId}`),
};

export const searchApi = {
  search: (params: Record<string, string | number>) => api.get('/api/search', { params }),
  suggest: (q: string) => api.get('/api/search/suggest', { params: { q } }),
};

export const kycApi = {
  getStatus: (address: string) => api.get(`/api/kyc/status/${address}`),
  getToken: (address: string) => api.post('/api/kyc/token', { address }),
};

export const paymentApi = {
  createCheckout: (body: { address: string; amountUsd: number; escrowId?: string }) =>
    api.post('/api/payments/checkout', body),
  getStatus: (sessionId: string) => api.get(`/api/payments/status/${sessionId}`),
  list: (address: string) => api.get(`/api/payments/${address}`),
};
