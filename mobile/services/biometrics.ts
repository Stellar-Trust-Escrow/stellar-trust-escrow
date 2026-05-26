/**
 * Biometric Authentication Service
 *
 * Wraps expo-local-authentication to provide Face ID / Touch ID / Fingerprint
 * authentication before sensitive actions (viewing escrow details, signing txs).
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { storage, STORAGE_KEYS } from '../lib/storage';

export async function isBiometricAvailable(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) return false;
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return enrolled;
}

export async function getSupportedBiometricTypes(): Promise<string[]> {
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  return types.map((t) => {
    switch (t) {
      case LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION:
        return 'Face ID';
      case LocalAuthentication.AuthenticationType.FINGERPRINT:
        return 'Fingerprint';
      case LocalAuthentication.AuthenticationType.IRIS:
        return 'Iris';
      default:
        return 'Biometric';
    }
  });
}

export async function authenticate(reason = 'Authenticate to continue'): Promise<boolean> {
  const available = await isBiometricAvailable();
  if (!available) return true; // gracefully skip if not available

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    fallbackLabel: 'Use Passcode',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
  });

  return result.success;
}

export function isBiometricEnabled(): boolean {
  return storage.getBoolean(STORAGE_KEYS.BIOMETRIC_ENABLED) ?? false;
}

export function setBiometricEnabled(enabled: boolean): void {
  storage.set(STORAGE_KEYS.BIOMETRIC_ENABLED, enabled);
}
