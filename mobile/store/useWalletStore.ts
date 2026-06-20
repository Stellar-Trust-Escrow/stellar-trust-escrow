/**
 * Wallet Store (Zustand)
 *
 * Holds the connected Stellar address and network.
 * Persisted to MMKV so the session survives app restarts.
 */

import { create } from 'zustand';
import { storage, STORAGE_KEYS } from '../lib/storage';
import { isValidStellarAddress } from '../lib/stellar';

interface WalletState {
  address: string | null;
  network: 'testnet' | 'mainnet';
  isConnected: boolean;
  setAddress: (address: string) => void;
  disconnect: () => void;
  hydrate: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  address: null,
  network: (process.env.EXPO_PUBLIC_STELLAR_NETWORK as 'testnet' | 'mainnet') ?? 'testnet',
  isConnected: false,

  setAddress: (address: string) => {
    if (!isValidStellarAddress(address)) {
      throw new Error('Invalid Stellar address');
    }
    storage.set(STORAGE_KEYS.WALLET_ADDRESS, address);
    set({ address, isConnected: true });
  },

  disconnect: () => {
    storage.delete(STORAGE_KEYS.WALLET_ADDRESS);
    set({ address: null, isConnected: false });
  },

  hydrate: () => {
    const saved = storage.getString(STORAGE_KEYS.WALLET_ADDRESS);
    if (saved && isValidStellarAddress(saved)) {
      set({ address: saved, isConnected: true });
    }
  },
}));
