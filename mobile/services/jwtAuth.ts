/**
 * JWT Authentication Service
 *
 * Handles challenge-response auth flow with Stellar keypair signing.
 * Stores JWT in SecureStore (encrypted at rest, requires device unlock).
 */

import { Keypair } from '@stellar/stellar-sdk';
import { secureStorage, STORAGE_KEYS } from '../lib/storage';
import { api } from '../lib/api';

const JWT_KEY = 'auth_jwt';
const KEYPAIR_SECRET_KEY = 'stellar_keypair_secret';

export const jwtAuth = {
  /**
   * Store the user's Stellar secret key in encrypted storage (only after explicit user grant).
   * This is a one-time operation during wallet connect flow.
   */
  async setKeypairSecret(secret: string): Promise<void> {
    await secureStorage.set(KEYPAIR_SECRET_KEY, secret);
  },

  /**
   * Request a nonce/challenge from the backend.
   */
  async requestNonce(address: string): Promise<string> {
    try {
      const response = await api.post('/api/auth/nonce', { address });
      return response.data.message;
    } catch (err) {
      throw new Error(`Failed to request nonce: ${err}`);
    }
  },

  /**
   * Sign the challenge message with the Stellar keypair and submit to get JWT.
   */
  async verifyAndGetToken(address: string, message: string): Promise<string> {
    const secret = await secureStorage.get(KEYPAIR_SECRET_KEY);
    if (!secret) {
      throw new Error('Keypair not found in secure storage');
    }

    const keypair = Keypair.fromSecret(secret);
    const signature = keypair.sign(Buffer.from(message, 'utf8')).toString('base64');

    try {
      const response = await api.post('/api/auth/verify', { address, signature });
      const token = response.data.token;

      // Store JWT in SecureStore with ALWAYS accessibility (requires device unlock)
      await secureStorage.setWithAccessibility(JWT_KEY, token, 'ALWAYS');
      return token;
    } catch (err) {
      throw new Error(`Signature verification failed: ${err}`);
    }
  },

  /**
   * Perform the full auth flow: request nonce → sign → verify → store JWT.
   */
  async authenticate(address: string): Promise<string> {
    const message = await this.requestNonce(address);
    const token = await this.verifyAndGetToken(address, message);
    return token;
  },

  /**
   * Retrieve the stored JWT from SecureStore.
   */
  async getToken(): Promise<string | null> {
    return secureStorage.get(JWT_KEY);
  },

  /**
   * Clear the stored JWT (logout).
   */
  async clearToken(): Promise<void> {
    await secureStorage.delete(JWT_KEY);
  },

  /**
   * Silent re-authentication: attempt to get a new token using stored keypair.
   * Returns null if re-auth fails (user should be redirected to connect screen).
   */
  async silentRefresh(address: string): Promise<string | null> {
    try {
      const message = await this.requestNonce(address);
      const token = await this.verifyAndGetToken(address, message);
      return token;
    } catch {
      return null;
    }
  },
};
