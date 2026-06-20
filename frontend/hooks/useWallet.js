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
import { Networks } from '@stellar/stellar-sdk';
import {
  isConnected as freighterIsConnected,
  getPublicKey,
  signTransaction,
  requestAccess,
  getNetworkDetails,
} from '@stellar/freighter-api';
import { useWalletStore } from '../store/app-store';

const FREIGHTER_INSTALL_URL = 'https://www.freighter.app/';

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
    finishConnect,
    setConnectError,
    disconnect,
  } = useWalletStore();

  // ── Detect Freighter on mount ──────────────────────────────────────────────
  useEffect(() => {
    setFreighterInstalled(typeof window !== 'undefined' && !!window.freighter);
  }, [setFreighterInstalled]);

  // ── Auto-restore connection on mount ───────────────────────────────────────
  useEffect(() => {
    const restoreConnection = async () => {
      if (!isFreighterInstalled) return;

      try {
        if (await freighterIsConnected()) {
          const pubKey = await getPublicKey();
          const networkDetails = await getNetworkDetails();
          finishConnect({
            address: pubKey,
            network: networkDetails.network === 'PUBLIC_NETWORK' ? 'mainnet' : 'testnet',
          });
        }
      } catch {
        // Silent fail on restore — user can reconnect manually
      }
    };

    restoreConnection();
  }, [isFreighterInstalled, finishConnect]);

  // ── Connect ────────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    startConnect();
    try {
      if (!isFreighterInstalled) {
        throw new Error(
          `Freighter wallet not installed. Install it here: ${FREIGHTER_INSTALL_URL}`,
        );
      }

      await requestAccess();
      const pubKey = await getPublicKey();
      const networkDetails = await getNetworkDetails();

      finishConnect({
        address: pubKey,
        network: networkDetails.network === 'PUBLIC_NETWORK' ? 'mainnet' : 'testnet',
      });
    } catch (err) {
      const message =
        err.message === 'User rejected access'
          ? 'You declined wallet connection.'
          : err.message;
      setConnectError(message);
    }
  }, [isFreighterInstalled, startConnect, finishConnect, setConnectError]);

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
    async (unsignedXdr) => {
      if (!isConnected) throw new Error('Wallet not connected');

      try {
        const networkPassphrase =
          network === 'mainnet' ? Networks.PUBLIC_NETWORK : Networks.TESTNET_NETWORK;

        const signedXdr = await signTransaction(unsignedXdr, {
          networkPassphrase,
          accountToSign: address,
        });

        return signedXdr;
      } catch (err) {
        const message =
          err.message === 'User rejected signing'
            ? 'Transaction signing was cancelled.'
            : `Signing failed: ${err.message}`;
        throw new Error(message);
      }
    },
    [isConnected, network, address],
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
