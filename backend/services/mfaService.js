/**
 * MFA Service
 *
 * Handles multi-factor authentication with TOTP and WebAuthn support.
 * Provides secure registration, verification, and brute-force protection.
 *
 * @module services/mfaService
 */

import crypto from 'crypto';
import { authenticator } from 'otplib';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import prisma from '../lib/prisma.js';
import cache from '../lib/cache.js';

// Configuration
const TOTP_WINDOW = 1; // Allow 1 step before/after current time (30s window each)
const TOTP_STEP = 30; // 30 second time step
const BACKUP_CODE_COUNT = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// WebAuthn configuration
const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'StellarTrustEscrow';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'localhost';
const ORIGIN = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';

// Encryption key for TOTP secrets (should be in env)
const ENCRYPTION_KEY = process.env.MFA_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

/**
 * Encrypt sensitive data (TOTP secrets, backup codes)
 */
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive data
 */
function decrypt(text) {
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Generate cryptographically secure backup codes
 */
function generateBackupCodes() {
  const codes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4, 8)}`);
  }
  return codes;
}

/**
 * Hash backup code for storage
 */
function hashBackupCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Check if user is locked out due to failed MFA attempts
 */
async function checkLockout(userId, tenantId) {
  const lockout = await prisma.mfaLockout.findUnique({
    where: { userId },
  });

  if (!lockout) return { locked: false };

  if (new Date() < lockout.lockedUntil) {
    return {
      locked: true,
      lockedUntil: lockout.lockedUntil,
      remainingMs: lockout.lockedUntil.getTime() - Date.now(),
    };
  }

  // Lockout expired, remove it
  await prisma.mfaLockout.delete({ where: { userId } });
  return { locked: false };
}

/**
 * Record MFA attempt and enforce lockout policy
 */
async function recordAttempt(userId, tenantId, methodType, success, ipAddress, userAgent, failureReason = null) {
  // Record the attempt
  await prisma.mfaAttempt.create({
    data: {
      userId,
      tenantId,
      methodType,
      success,
      ipAddress,
      userAgent,
      failureReason,
    },
  });

  if (success) {
    // Clear lockout on successful attempt
    await prisma.mfaLockout.deleteMany({ where: { userId } });
    return { locked: false };
  }

  // Count recent failed attempts
  const windowStart = new Date(Date.now() - ATTEMPT_WINDOW_MS);
  const failedAttempts = await prisma.mfaAttempt.count({
    where: {
      userId,
      success: false,
      createdAt: { gte: windowStart },
    },
  });

  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    
    await prisma.mfaLockout.upsert({
      where: { userId },
      create: {
        userId,
        tenantId,
        lockedUntil,
        attempts: failedAttempts,
      },
      update: {
        lockedUntil,
        attempts: failedAttempts,
        updatedAt: new Date(),
      },
    });

    return {
      locked: true,
      lockedUntil,
      remainingMs: LOCKOUT_DURATION_MS,
    };
  }

  return { locked: false, attemptsRemaining: MAX_FAILED_ATTEMPTS - failedAttempts };
}

// ── TOTP Methods ──────────────────────────────────────────────────────────────

/**
 * Initialize TOTP setup for a user
 * Returns secret and QR code data
 */
async function initializeTOTP(userId, tenantId, userEmail, methodName = 'Authenticator App') {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(userEmail, RP_NAME, secret);

  // Store in cache temporarily (10 minutes) until user confirms
  const setupKey = `mfa:totp:setup:${userId}`;
  await cache.set(setupKey, { secret, methodName }, 600);

  return {
    secret,
    otpauth,
    methodName,
  };
}

/**
 * Verify TOTP code and complete registration
 */
async function verifyAndRegisterTOTP(userId, tenantId, code, ipAddress, userAgent) {
  const setupKey = `mfa:totp:setup:${userId}`;
  const setup = await cache.get(setupKey);

  if (!setup) {
    throw new Error('TOTP setup not found or expired. Please restart setup.');
  }

  // Verify the code
  const isValid = authenticator.verify({
    token: code,
    secret: setup.secret,
    window: TOTP_WINDOW,
  });

  if (!isValid) {
    await recordAttempt(userId, tenantId, 'TOTP', false, ipAddress, userAgent, 'Invalid TOTP code during setup');
    throw new Error('Invalid verification code');
  }

  // Generate backup codes
  const backupCodes = generateBackupCodes();
  const hashedBackupCodes = backupCodes.map(code => encrypt(hashBackupCode(code)));

  // Save the method
  const method = await prisma.mfaMethod.create({
    data: {
      userId,
      tenantId,
      type: 'TOTP',
      name: setup.methodName,
      totpSecret: encrypt(setup.secret),
      totpBackupCodes: hashedBackupCodes,
      isActive: true,
      isPrimary: true, // First method is primary
    },
  });

  // Enable MFA for user
  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: true },
  });

  // Clear setup cache
  await cache.del(setupKey);

  // Record successful setup
  await recordAttempt(userId, tenantId, 'TOTP', true, ipAddress, userAgent);

  return {
    method: {
      id: method.id,
      type: method.type,
      name: method.name,
    },
    backupCodes, // Return plaintext codes ONCE for user to save
  };
}

/**
 * Verify TOTP code for authentication
 */
async function verifyTOTP(userId, tenantId, code, ipAddress, userAgent) {
  // Check lockout
  const lockout = await checkLockout(userId, tenantId);
  if (lockout.locked) {
    throw new Error(`Account locked due to too many failed attempts. Try again in ${Math.ceil(lockout.remainingMs / 60000)} minutes.`);
  }

  // Get active TOTP method
  const method = await prisma.mfaMethod.findFirst({
    where: {
      userId,
      tenantId,
      type: 'TOTP',
      isActive: true,
    },
  });

  if (!method || !method.totpSecret) {
    throw new Error('TOTP not configured for this user');
  }

  const secret = decrypt(method.totpSecret);

  // Try TOTP verification
  const isValid = authenticator.verify({
    token: code,
    secret,
    window: TOTP_WINDOW,
  });

  if (isValid) {
    await prisma.mfaMethod.update({
      where: { id: method.id },
      data: { lastUsedAt: new Date() },
    });

    await recordAttempt(userId, tenantId, 'TOTP', true, ipAddress, userAgent);
    return { verified: true, method: 'TOTP' };
  }

  // Try backup codes
  const backupCodeHash = hashBackupCode(code.replace('-', ''));
  const hashedCodes = method.totpBackupCodes.map(encrypted => decrypt(encrypted));
  
  const backupIndex = hashedCodes.findIndex(hash => hash === backupCodeHash);
  
  if (backupIndex !== -1) {
    // Remove used backup code
    const updatedCodes = [...method.totpBackupCodes];
    updatedCodes.splice(backupIndex, 1);

    await prisma.mfaMethod.update({
      where: { id: method.id },
      data: {
        totpBackupCodes: updatedCodes,
        lastUsedAt: new Date(),
      },
    });

    await recordAttempt(userId, tenantId, 'TOTP', true, ipAddress, userAgent);
    
    return {
      verified: true,
      method: 'TOTP_BACKUP',
      backupCodesRemaining: updatedCodes.length,
    };
  }

  // Failed verification
  const result = await recordAttempt(userId, tenantId, 'TOTP', false, ipAddress, userAgent, 'Invalid TOTP code');
  
  if (result.locked) {
    throw new Error(`Too many failed attempts. Account locked for ${Math.ceil(result.remainingMs / 60000)} minutes.`);
  }

  throw new Error(`Invalid verification code. ${result.attemptsRemaining} attempts remaining.`);
}

// ── WebAuthn Methods ──────────────────────────────────────────────────────────

/**
 * Generate WebAuthn registration options
 */
async function generateWebAuthnRegistration(userId, tenantId, userEmail, methodName = 'Security Key') {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      mfaMethods: {
        where: { type: 'WEBAUTHN', isActive: true },
      },
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Get existing credentials to exclude
  const excludeCredentials = user.mfaMethods
    .filter(m => m.credentialId)
    .map(m => ({
      id: Buffer.from(m.credentialId, 'base64'),
      type: 'public-key',
      transports: m.transports,
    }));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: userId.toString(),
    userName: userEmail,
    userDisplayName: userEmail,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  // Store challenge temporarily
  const challengeKey = `mfa:webauthn:challenge:${userId}`;
  await cache.set(challengeKey, { challenge: options.challenge, methodName }, 300); // 5 minutes

  return options;
}

/**
 * Verify WebAuthn registration response
 */
async function verifyWebAuthnRegistration(userId, tenantId, response, ipAddress, userAgent) {
  const challengeKey = `mfa:webauthn:challenge:${userId}`;
  const stored = await cache.get(challengeKey);

  if (!stored) {
    throw new Error('Registration challenge not found or expired');
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });
  } catch (error) {
    await recordAttempt(userId, tenantId, 'WEBAUTHN', false, ipAddress, userAgent, error.message);
    throw new Error(`WebAuthn registration failed: ${error.message}`);
  }

  if (!verification.verified || !verification.registrationInfo) {
    await recordAttempt(userId, tenantId, 'WEBAUTHN', false, ipAddress, userAgent, 'Verification failed');
    throw new Error('WebAuthn registration verification failed');
  }

  const { credentialPublicKey, credentialID, counter, aaguid } = verification.registrationInfo;

  // Save the credential
  const method = await prisma.mfaMethod.create({
    data: {
      userId,
      tenantId,
      type: 'WEBAUTHN',
      name: stored.methodName,
      credentialId: Buffer.from(credentialID).toString('base64'),
      publicKey: Buffer.from(credentialPublicKey).toString('base64'),
      counter: BigInt(counter),
      transports: response.response.transports || [],
      aaguid: aaguid ? Buffer.from(aaguid).toString('hex') : null,
      isActive: true,
      isPrimary: true,
    },
  });

  // Enable MFA for user
  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: true },
  });

  // Clear challenge
  await cache.del(challengeKey);

  await recordAttempt(userId, tenantId, 'WEBAUTHN', true, ipAddress, userAgent);

  return {
    method: {
      id: method.id,
      type: method.type,
      name: method.name,
    },
  };
}

/**
 * Generate WebAuthn authentication options
 */
async function generateWebAuthnAuthentication(userId, tenantId) {
  const methods = await prisma.mfaMethod.findMany({
    where: {
      userId,
      tenantId,
      type: 'WEBAUTHN',
      isActive: true,
    },
  });

  if (methods.length === 0) {
    throw new Error('No WebAuthn credentials registered');
  }

  const allowCredentials = methods.map(m => ({
    id: Buffer.from(m.credentialId, 'base64'),
    type: 'public-key',
    transports: m.transports,
  }));

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials,
    userVerification: 'preferred',
  });

  // Store challenge
  const challengeKey = `mfa:webauthn:auth:${userId}`;
  await cache.set(challengeKey, options.challenge, 300); // 5 minutes

  return options;
}

/**
 * Verify WebAuthn authentication response
 */
async function verifyWebAuthnAuthentication(userId, tenantId, response, ipAddress, userAgent) {
  // Check lockout
  const lockout = await checkLockout(userId, tenantId);
  if (lockout.locked) {
    throw new Error(`Account locked due to too many failed attempts. Try again in ${Math.ceil(lockout.remainingMs / 60000)} minutes.`);
  }

  const challengeKey = `mfa:webauthn:auth:${userId}`;
  const expectedChallenge = await cache.get(challengeKey);

  if (!expectedChallenge) {
    throw new Error('Authentication challenge not found or expired');
  }

  // Find the credential
  const credentialId = Buffer.from(response.id, 'base64').toString('base64');
  const method = await prisma.mfaMethod.findFirst({
    where: {
      userId,
      tenantId,
      credentialId,
      type: 'WEBAUTHN',
      isActive: true,
    },
  });

  if (!method) {
    await recordAttempt(userId, tenantId, 'WEBAUTHN', false, ipAddress, userAgent, 'Credential not found');
    throw new Error('Credential not found');
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      authenticator: {
        credentialID: Buffer.from(method.credentialId, 'base64'),
        credentialPublicKey: Buffer.from(method.publicKey, 'base64'),
        counter: Number(method.counter),
      },
    });
  } catch (error) {
    const result = await recordAttempt(userId, tenantId, 'WEBAUTHN', false, ipAddress, userAgent, error.message);
    
    if (result.locked) {
      throw new Error(`Too many failed attempts. Account locked for ${Math.ceil(result.remainingMs / 60000)} minutes.`);
    }
    
    throw new Error(`WebAuthn authentication failed: ${error.message}`);
  }

  if (!verification.verified) {
    const result = await recordAttempt(userId, tenantId, 'WEBAUTHN', false, ipAddress, userAgent, 'Verification failed');
    
    if (result.locked) {
      throw new Error(`Too many failed attempts. Account locked for ${Math.ceil(result.remainingMs / 60000)} minutes.`);
    }
    
    throw new Error('WebAuthn authentication verification failed');
  }

  // Update counter to prevent replay attacks
  await prisma.mfaMethod.update({
    where: { id: method.id },
    data: {
      counter: BigInt(verification.authenticationInfo.newCounter),
      lastUsedAt: new Date(),
    },
  });

  // Clear challenge
  await cache.del(challengeKey);

  await recordAttempt(userId, tenantId, 'WEBAUTHN', true, ipAddress, userAgent);

  return { verified: true, method: 'WEBAUTHN' };
}

// ── Management Methods ────────────────────────────────────────────────────────

/**
 * List all MFA methods for a user
 */
async function listMfaMethods(userId, tenantId) {
  const methods = await prisma.mfaMethod.findMany({
    where: { userId, tenantId, isActive: true },
    select: {
      id: true,
      type: true,
      name: true,
      isPrimary: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });

  return methods;
}

/**
 * Remove an MFA method
 */
async function removeMfaMethod(userId, tenantId, methodId) {
  const method = await prisma.mfaMethod.findFirst({
    where: { id: methodId, userId, tenantId },
  });

  if (!method) {
    throw new Error('MFA method not found');
  }

  // Check if this is the last method
  const activeMethods = await prisma.mfaMethod.count({
    where: { userId, tenantId, isActive: true },
  });

  if (activeMethods === 1) {
    // Disable MFA for user
    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false },
    });
  }

  await prisma.mfaMethod.delete({ where: { id: methodId } });

  return { success: true };
}

/**
 * Check if user requires MFA
 */
async function requiresMfa(userId, tenantId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true, mfaEnforced: true, role: true },
  });

  if (!user) return false;

  // Admins always require MFA if enabled
  if (user.role === 'admin' || user.role === 'superadmin') {
    return user.mfaEnabled;
  }

  // Regular users only if enforced
  return user.mfaEnabled && user.mfaEnforced;
}

export default {
  // TOTP
  initializeTOTP,
  verifyAndRegisterTOTP,
  verifyTOTP,
  
  // WebAuthn
  generateWebAuthnRegistration,
  verifyWebAuthnRegistration,
  generateWebAuthnAuthentication,
  verifyWebAuthnAuthentication,
  
  // Management
  listMfaMethods,
  removeMfaMethod,
  requiresMfa,
  checkLockout,
};
