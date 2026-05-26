'use client';

/**
 * useAuth — Wallet Signature Authentication Hook
 *
 * Implements the full challenge-response auth flow:
 *   1. Request a nonce from the backend for the connected wallet address
 *   2. Ask the user to sign the challenge message via Freighter
 *   3. Send the signature to the backend for verification
 *   4. Store the returned JWT and expose it to the app
 *
 * Usage:
 *   const { login, logout, token, isAuthenticated, isLoading, error } = useAuth();
 *
 * Requires the wallet to be connected first (useWallet).
 */

import { useState, useCallback, useEffect } from 'react';
import { signMessage } from '@stellar/freighter-api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const TOKEN_KEY = 'ste_auth_token';
const ADDRESS_KEY = 'ste_auth_address';

export function useAuth(walletAddress) {
  const [token, setToken] = useState(null);
  const [authAddress, setAuthAddress] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(TOKEN_KEY);
      const storedAddr = localStorage.getItem(ADDRESS_KEY);
      if (stored && storedAddr) {
        setToken(stored);
        setAuthAddress(storedAddr);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const isAuthenticated = !!token && authAddress === walletAddress;

  /**
   * Full login flow:
   * 1. GET nonce from backend
   * 2. Sign challenge with Freighter
   * 3. POST signature to backend
   * 4. Store JWT
   */
  const login = useCallback(async () => {
    if (!walletAddress) {
      setError('Connect your wallet first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1 — request nonce
      const nonceRes = await fetch(`${API_BASE}/api/auth/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      });

      if (!nonceRes.ok) {
        const err = await nonceRes.json();
        throw new Error(err.error || 'Failed to get nonce');
      }

      const { message } = await nonceRes.json();

      // Step 2 — sign with Freighter
      // signMessage signs arbitrary UTF-8 strings (not transaction XDR)
      let signature;
      try {
        const result = await signMessage(message, {
          accountToSign: walletAddress,
        });
        signature = result.signedMessage ?? result;
      } catch (sigErr) {
        if (sigErr.message?.includes('User declined')) {
          throw new Error('Signature rejected — authentication cancelled');
        }
        throw new Error(`Wallet signing failed: ${sigErr.message}`);
      }

      // Step 3 — verify signature
      const verifyRes = await fetch(`${API_BASE}/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress, signature }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Signature verification failed');
      }

      const { token: jwt } = await verifyRes.json();

      // Step 4 — persist
      setToken(jwt);
      setAuthAddress(walletAddress);
      try {
        localStorage.setItem(TOKEN_KEY, jwt);
        localStorage.setItem(ADDRESS_KEY, walletAddress);
      } catch {
        // ignore storage errors
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST' });
    } catch {
      // best-effort
    }
    setToken(null);
    setAuthAddress(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ADDRESS_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { login, logout, token, authAddress, isAuthenticated, isLoading, error };
}
