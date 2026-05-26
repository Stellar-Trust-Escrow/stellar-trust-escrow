'use client';

import useSWR from 'swr';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const fetcher = (url) => fetch(url).then((r) => r.json());

/**
 * Fetch a single escrow by ID.
 * Polls every 30 seconds; pauses automatically when the page is hidden.
 *
 * @param {number|string} id — escrow_id
 * @returns {{ escrow: object|null, isLoading: boolean, error: Error|null, mutate: Function }}
 */
export function useEscrow(id) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `${API_URL}/api/escrows/${id}` : null,
    fetcher,
    {
      refreshInterval: 30_000,  // poll every 30 seconds
      refreshWhenHidden: false, // pause polling when page is not visible
    }
  );
  return { escrow: data, isLoading, error, mutate };
}

/**
 * Fetch all escrows for the connected user.
 *
 * @param {string} address — Stellar public key
 * @param {'client'|'freelancer'|'all'} role
 * @returns {{ escrows: Array, isLoading: boolean, error: Error|null }}
 *
 * TODO (contributor — Issue #39)
 */
export function useUserEscrows(_address, _role = 'all') {
  // TODO: implement with SWR
  return { escrows: [], isLoading: false, error: null };
}

/**
 * Fetch paginated list of all escrows (for Explorer).
 *
 * @param {{ page: number, limit: number, status: string }} options
 *
 * TODO (contributor — Issue #39)
 */
export function useEscrowList({ page: _page = 1, limit: _limit = 20, status: _status = '' } = {}) {
  // TODO: implement with SWR
  return { escrows: [], total: 0, isLoading: false, error: null };
}
