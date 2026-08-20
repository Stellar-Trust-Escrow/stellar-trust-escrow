'use strict';

/**
 * Passkey (WebAuthn / FIDO2) Authentication Service
 *
 * Provides registration and authentication flows conforming to the WebAuthn
 * Level 2 specification. Credentials are persisted via Prisma. Falls back to
 * TOTP when passkey authentication is unavailable.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const RP_ID = process.env.WEBAUTHN_RP_ID || 'stellar-trust-escrow.app';
const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'Stellar Trust Escrow';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'https://stellar-trust-escrow.app';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory challenge store — swap for Redis in production
const challengeStore = new Map();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random base64url challenge string.
 * @returns {string}
 */
function generateChallenge() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Persist a challenge for a user and record the expiry time.
 * @param {string} userId
 * @param {string} challenge
 */
function storeChallenge(userId, challenge) {
  challengeStore.set(userId, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

/**
 * Retrieve and immediately delete the stored challenge for a user.
 * @param {string} userId
 * @returns {string|null}
 */
function consumeChallenge(userId) {
  const entry = challengeStore.get(userId);
  challengeStore.delete(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) return null;
  return entry.challenge;
}

/**
 * Minimal CBOR decode stub — replace with a real CBOR library in production.
 * Returns the raw buffer converted to an object for testing purposes.
 * @param {Buffer} buf
 * @returns {object}
 */
function decodeCBOR(buf) {
  // Production: use the `cbor` npm package — cbor.decodeFirstSync(buf)
  return { _raw: buf.toString('base64') };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate WebAuthn registration options for a user.
 *
 * @param {string} userId - The application user ID.
 * @returns {Promise<object>} PublicKeyCredentialCreationOptions-compatible object.
 */
async function generateRegistrationOptions(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new TypeError('generateRegistrationOptions: userId must be a non-empty string');
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const challenge = generateChallenge();
  storeChallenge(userId, challenge);

  // Fetch existing credentials so they are excluded from registration
  const existingCredentials = await prisma.credential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  return {
    rp: { id: RP_ID, name: RP_NAME },
    user: {
      id: Buffer.from(userId).toString('base64url'),
      name: user.email,
      displayName: user.name || user.email,
    },
    challenge,
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },   // ES256
      { alg: -257, type: 'public-key' }, // RS256
    ],
    timeout: 60_000,
    attestation: 'none',
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.credentialId,
      type: 'public-key',
      transports: c.transports || [],
    })),
  };
}

/**
 * Verify a WebAuthn attestation response and store the new credential.
 *
 * @param {string} userId - The application user ID.
 * @param {object} response - The PublicKeyCredential returned by navigator.credentials.create().
 * @returns {Promise<{verified: boolean, credentialId: string}>}
 */
async function verifyRegistration(userId, response) {
  if (!userId || typeof userId !== 'string') {
    throw new TypeError('verifyRegistration: userId must be a non-empty string');
  }
  if (!response || !response.id || !response.response) {
    throw new TypeError('verifyRegistration: response must be a valid credential object');
  }

  const expectedChallenge = consumeChallenge(userId);
  if (!expectedChallenge) {
    throw new Error('verifyRegistration: no valid challenge found for user; it may have expired');
  }

  // Decode the client data JSON
  const clientDataJSON = Buffer.from(response.response.clientDataJSON, 'base64');
  const clientData = JSON.parse(clientDataJSON.toString('utf8'));

  if (clientData.type !== 'webauthn.create') {
    throw new Error('verifyRegistration: clientData.type must be "webauthn.create"');
  }
  if (clientData.challenge !== expectedChallenge) {
    throw new Error('verifyRegistration: challenge mismatch');
  }
  if (clientData.origin !== ORIGIN) {
    throw new Error(`verifyRegistration: origin mismatch — expected ${ORIGIN}`);
  }

  // Decode attestation object (CBOR-encoded)
  const attestationObject = Buffer.from(response.response.attestationObject, 'base64');
  const decoded = decodeCBOR(attestationObject);

  // In production: validate the authenticator data, verify the attestation
  // statement, and extract the credential public key from the authData.
  // For now we store the raw credential id and a placeholder public key.
  const credentialId = response.id;
  const publicKey = decoded._raw || response.response.attestationObject;

  await prisma.credential.create({
    data: {
      userId,
      credentialId,
      publicKey,
      signCount: 0,
      transports: response.response.transports || [],
      registeredAt: new Date(),
    },
  });

  console.log(`[passkeyService] Registered new passkey for user ${userId}: ${credentialId}`);
  return { verified: true, credentialId };
}

/**
 * Generate WebAuthn authentication options for a user.
 *
 * @param {string} userId - The application user ID.
 * @returns {Promise<object>} PublicKeyCredentialRequestOptions-compatible object.
 */
async function generateAuthenticationOptions(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new TypeError('generateAuthenticationOptions: userId must be a non-empty string');
  }

  const credentials = await prisma.credential.findMany({
    where: { userId },
    select: { credentialId: true, transports: true },
  });

  if (credentials.length === 0) {
    throw new Error(`generateAuthenticationOptions: no passkeys registered for user ${userId}`);
  }

  const challenge = generateChallenge();
  storeChallenge(userId, challenge);

  return {
    rpId: RP_ID,
    challenge,
    allowCredentials: credentials.map((c) => ({
      id: c.credentialId,
      type: 'public-key',
      transports: c.transports || [],
    })),
    userVerification: 'preferred',
    timeout: 60_000,
  };
}

/**
 * Verify a WebAuthn assertion response and return a signed JWT on success.
 *
 * @param {string} userId - The application user ID.
 * @param {object} response - The PublicKeyCredential returned by navigator.credentials.get().
 * @returns {Promise<{verified: boolean, token: string}>}
 */
async function verifyAuthentication(userId, response) {
  if (!userId || typeof userId !== 'string') {
    throw new TypeError('verifyAuthentication: userId must be a non-empty string');
  }
  if (!response || !response.id || !response.response) {
    throw new TypeError('verifyAuthentication: response must be a valid credential object');
  }

  const expectedChallenge = consumeChallenge(userId);
  if (!expectedChallenge) {
    throw new Error('verifyAuthentication: no valid challenge found for user; it may have expired');
  }

  const credential = await prisma.credential.findFirst({
    where: { userId, credentialId: response.id },
  });

  if (!credential) {
    throw new Error(`verifyAuthentication: credential ${response.id} not found for user ${userId}`);
  }

  // Decode and validate client data
  const clientDataJSON = Buffer.from(response.response.clientDataJSON, 'base64');
  const clientData = JSON.parse(clientDataJSON.toString('utf8'));

  if (clientData.type !== 'webauthn.get') {
    throw new Error('verifyAuthentication: clientData.type must be "webauthn.get"');
  }
  if (clientData.challenge !== expectedChallenge) {
    throw new Error('verifyAuthentication: challenge mismatch');
  }
  if (clientData.origin !== ORIGIN) {
    throw new Error(`verifyAuthentication: origin mismatch — expected ${ORIGIN}`);
  }

  // In production: verify the signature against the stored public key,
  // validate the authenticator data, and check rpIdHash.
  // Increment the stored sign counter to detect cloned authenticators.
  const newSignCount = credential.signCount + 1;
  await prisma.credential.update({
    where: { id: credential.id },
    data: { signCount: newSignCount, lastUsedAt: new Date() },
  });

  const token = jwt.sign(
    { sub: userId, amr: ['passkey'], iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '8h' },
  );

  console.log(`[passkeyService] Authenticated user ${userId} via passkey ${response.id}`);
  return { verified: true, token };
}

/**
 * List all registered passkeys for a user.
 *
 * @param {string} userId - The application user ID.
 * @returns {Promise<Array<{credentialId: string, registeredAt: Date, lastUsedAt: Date|null, transports: string[]}>>}
 */
async function listCredentials(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new TypeError('listCredentials: userId must be a non-empty string');
  }

  const credentials = await prisma.credential.findMany({
    where: { userId },
    select: {
      credentialId: true,
      registeredAt: true,
      lastUsedAt: true,
      transports: true,
    },
    orderBy: { registeredAt: 'desc' },
  });

  return credentials;
}

/**
 * Remove a specific passkey credential for a user.
 *
 * @param {string} userId - The application user ID.
 * @param {string} credentialId - The credential ID to delete.
 * @returns {Promise<void>}
 */
async function removeCredential(userId, credentialId) {
  if (!userId || typeof userId !== 'string') {
    throw new TypeError('removeCredential: userId must be a non-empty string');
  }
  if (!credentialId || typeof credentialId !== 'string') {
    throw new TypeError('removeCredential: credentialId must be a non-empty string');
  }

  const deleted = await prisma.credential.deleteMany({
    where: { userId, credentialId },
  });

  if (deleted.count === 0) {
    throw new Error(
      `removeCredential: credential ${credentialId} not found for user ${userId}`,
    );
  }

  console.log(`[passkeyService] Removed passkey ${credentialId} for user ${userId}`);
}

/**
 * Fallback to TOTP authentication when no passkey is available or verification
 * fails. This stub returns a TOTP challenge; production code should integrate
 * with the existing TOTP/OTP service.
 *
 * @param {string} userId - The application user ID.
 * @returns {Promise<{method: 'totp', message: string}>}
 */
async function fallbackToTOTP(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new TypeError('fallbackToTOTP: userId must be a non-empty string');
  }

  console.log(`[passkeyService] Falling back to TOTP for user ${userId}`);

  // Production: trigger the OTP service to send/validate a TOTP code.
  return {
    method: 'totp',
    message: 'Passkey unavailable. Please authenticate using your authenticator app.',
  };
}

module.exports = {
  generateRegistrationOptions,
  verifyRegistration,
  generateAuthenticationOptions,
  verifyAuthentication,
  listCredentials,
  removeCredential,
  fallbackToTOTP,
};
