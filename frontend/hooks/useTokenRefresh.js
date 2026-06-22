'use client';

/**
 * useTokenRefresh — proactively refreshes the JWT before it expires.
 *
 * Reads `exp` from the token claims and schedules a refresh call
 * REFRESH_BUFFER_MS before expiry. Falls back to clearing the token
 * (forcing re-auth) if the refresh fails or the token is malformed.
 */

import { useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';
import api from '../lib/api/client';
import { useWalletStore } from '../store/app-store';

const REFRESH_BUFFER_MS = 60_000;

export function useTokenRefresh() {
  const { token, setToken, clearToken } = useWalletStore();

  useEffect(() => {
    if (!token) return;

    let claims;
    try {
      claims = jwtDecode(token);
    } catch {
      clearToken();
      return;
    }

    if (!claims?.exp) return;

    const refreshInMs = Math.max(claims.exp * 1000 - Date.now() - REFRESH_BUFFER_MS, 0);

    const timer = setTimeout(async () => {
      try {
        const { data } = await api.post('/auth/refresh');
        setToken(data.token);
      } catch {
        clearToken();
      }
    }, refreshInMs);

    return () => clearTimeout(timer);
  }, [token, setToken, clearToken]);
}
