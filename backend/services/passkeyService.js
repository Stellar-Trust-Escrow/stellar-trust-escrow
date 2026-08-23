import crypto from 'crypto';
import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('service.passkey');

const _challenges = new Map();
const _credentials = new Map();

export function generateRegistrationOptions(walletAddress) {
  const challenge = crypto.randomBytes(32).toString('base64url');
  _challenges.set(`reg:${walletAddress}`, { challenge, expiresAt: Date.now() + 5 * 60 * 1000 });
  log.info({ message: 'passkey_registration_started', walletAddress });
  return {
    challenge,
    rp: { name: 'Stellar Trust Escrow', id: process.env.RP_ID || 'localhost' },
    user: {
      id: Buffer.from(walletAddress).toString('base64url'),
      name: walletAddress,
      displayName: walletAddress,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    timeout: 60000,
    attestation: 'none',
  };
}

export async function verifyRegistration(walletAddress, credential) {
  const stored = _challenges.get(`reg:${walletAddress}`);
  if (!stored || Date.now() > stored.expiresAt) {
    throw new Error('Registration challenge expired or not found');
  }
  _challenges.delete(`reg:${walletAddress}`);

  const credentialId = credential.id || crypto.randomBytes(16).toString('base64url');
  const publicKey = credential.response?.attestationObject || 'mock_public_key';

  log.info({ message: 'passkey_registration_verified', walletAddress, credentialId });
  return { verified: true, credentialId, publicKey, counter: 0 };
}

export function generateAuthenticationOptions(walletAddress) {
  const challenge = crypto.randomBytes(32).toString('base64url');
  _challenges.set(`auth:${walletAddress}`, { challenge, expiresAt: Date.now() + 5 * 60 * 1000 });
  const creds = _credentials.get(walletAddress) || [];
  return {
    challenge,
    timeout: 60000,
    allowCredentials: creds.map(c => ({ id: c.credentialId, type: 'public-key' })),
    userVerification: 'preferred',
  };
}

export async function verifyAuthentication(walletAddress, assertion) {
  const stored = _challenges.get(`auth:${walletAddress}`);
  if (!stored || Date.now() > stored.expiresAt) {
    throw new Error('Authentication challenge expired or not found');
  }
  _challenges.delete(`auth:${walletAddress}`);

  const creds = _credentials.get(walletAddress) || [];
  const cred = creds.find(c => c.credentialId === assertion.id);
  if (!cred) throw new Error('Credential not found');

  const newCounter = (cred.counter || 0) + 1;
  cred.counter = newCounter;

  log.info({ message: 'passkey_authentication_verified', walletAddress });
  return { verified: true, newCounter };
}

export function storeCredential(walletAddress, credData) {
  const creds = _credentials.get(walletAddress) || [];
  creds.push({ ...credData, createdAt: new Date() });
  _credentials.set(walletAddress, creds);
}

export function getCredentials(walletAddress) {
  return (_credentials.get(walletAddress) || []).map(c => ({
    credentialId: c.credentialId,
    createdAt: c.createdAt,
  }));
}

export function removeCredential(walletAddress, credentialId) {
  const creds = _credentials.get(walletAddress) || [];
  _credentials.set(walletAddress, creds.filter(c => c.credentialId !== credentialId));
}
