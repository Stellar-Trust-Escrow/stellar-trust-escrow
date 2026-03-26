/**
 * useWallet Hook
 *
 * Manages Freighter wallet connection state across the app.
 * Use this hook in any component that needs wallet access.
 *
 * Returns:
 * {
 *   isConnected:  boolean
 *   address:      string | null       — connected Stellar public key
 *   network:      'testnet' | 'mainnet' | null
 *   connect:      () => Promise<void>
 *   disconnect:   () => void
 *   signTx:       (xdr: string) => Promise<string>  — returns signed XDR
 *   isFreighterInstalled: boolean
 * }
 *
 * TODO (contributor — hard, Issue #35):
 * Implement this hook using the @stellar/freighter-api package:
 *
 * import {
 *   isConnected,
 *   getPublicKey,
 *   signTransaction,
 *   requestAccess,
 *   getNetworkDetails,
 * } from '@stellar/freighter-api';
 *
 * Steps:
 * 1. On mount, check if Freighter is installed (window.freighter exists)
 * 2. Check if already connected (isConnected())
 * 3. If connected, fetch address and network
 * 4. connect():
 *    a. Call requestAccess() to prompt Freighter connection popup
 *    b. Fetch and store public key
 *    c. Fetch and store network details
 * 5. disconnect(): clear state (Freighter doesn't have a disconnect API)
 * 6. signTx(xdr):
 *    a. Call signTransaction(xdr, { networkPassphrase, accountToSign })
 *    b. Return the signed XDR string
 *
 * Hints:
 * - Store address in React context (not just local state) so all components
 *   can access it without prop drilling. Wrap app in a WalletProvider.
 * - Persist connection state in localStorage so the user stays connected
 *   across page refreshes.
 * - Handle the case where Freighter is not installed: show install prompt.
 */

'use client';

import { useCallback, useEffect } from 'react';
import { useWalletStore } from '../store/app-store';

export function useWallet() {
  const {
    address,
    network,
    isConnected,
    isFreighterInstalled,
    isConnecting,
    error,
    setFreighterInstalled,
    startConnect,
    setConnectError,
    disconnect,
  } = useWalletStore();

  // ── Detect Freighter on mount ──────────────────────────────────────────────
  useEffect(() => {
    setFreighterInstalled(typeof window !== 'undefined' && !!window.freighter);
  }, []);

  // ── Connect ────────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    startConnect();
    try {
      // TODO (contributor — Issue #35): implement Freighter connection
      // const access = await requestAccess();
      // const publicKey = await getPublicKey();
      // const { networkPassphrase } = await getNetworkDetails();
      // setAddress(publicKey);
      // setNetwork(networkPassphrase.includes('Test') ? 'testnet' : 'mainnet');
      // setIsConnected(true);
      // localStorage.setItem('wallet_address', publicKey);
      throw new Error('Freighter integration not yet implemented — see Issue #35');
    } catch (err) {
      setConnectError(err.message);
    }
  }, [setConnectError, startConnect]);

  // ── Sign Transaction ───────────────────────────────────────────────────────
  /**
   * Signs a Stellar transaction XDR with the connected Freighter wallet.
   *
   * @param {string} unsignedXdr — base64-encoded unsigned transaction XDR
   * @returns {Promise<string>}  — base64-encoded signed transaction XDR
   *
   * TODO (contributor — Issue #35):
   * const signedXdr = await signTransaction(unsignedXdr, {
   *   networkPassphrase: network === 'testnet'
   *     ? Networks.TESTNET
   *     : Networks.PUBLIC,
   *   accountToSign: address,
   * });
   * return signedXdr;
   */
  const signTx = useCallback(
    async (_unsignedXdr) => {
      if (!isConnected) throw new Error('Wallet not connected');
      // TODO (contributor — Issue #35): implement
      throw new Error('signTx not implemented — see Issue #35');
    },
    [isConnected],
  );

  return {
    address,
    network,
    isConnected,
    isFreighterInstalled,
    isConnecting,
    error,
    connect,
    disconnect,
    signTx,
  };
}
