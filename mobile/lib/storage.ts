/**
 * Persistent storage wrapper.
 * Uses MMKV for fast synchronous reads (wallet address, preferences)
 * and expo-secure-store for sensitive data (private keys, tokens).
 */

import { MMKV } from 'react-native-mmkv';
import * as SecureStore from 'expo-secure-store';

export const storage = new MMKV({ id: 'ste-storage' });

// Keys
export const STORAGE_KEYS = {
  WALLET_ADDRESS: 'wallet_address',
  STELLAR_NETWORK: 'stellar_network',
  PUSH_TOKEN: 'push_token',
  BIOMETRIC_ENABLED: 'biometric_enabled',
  LAST_LEDGER: 'last_ledger',
  OFFLINE_ESCROWS: 'offline_escrows',
} as const;

// Secure store helpers for sensitive values
export const secureStorage = {
  async set(key: string, value: string): Promise<void> {
    await SecureStore.setItemAsync(key, value);
  },
  async get(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key);
  },
  async delete(key: string): Promise<void> {
    await SecureStore.deleteItemAsync(key);
  },
};
