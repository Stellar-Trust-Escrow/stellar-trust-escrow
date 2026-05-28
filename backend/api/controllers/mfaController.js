/**
 * MFA Controller
 *
 * Handles multi-factor authentication setup, verification, and management.
 * Supports both TOTP (Time-based One-Time Password) and WebAuthn (hardware keys).
 *
 * @module controllers/mfaController
 */

import mfaService from '../../services/mfaService.js';
import { generateMfaToken } from '../middleware/mfaAuth.js';
import QRCode from 'qrcode';

/**
 * GET /api/mfa/status
 * Check if user has MFA enabled and list available methods
 */
export const getMfaStatus = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const tenantId = req.tenant?.id || req.user.tenantId;

    const methods = await mfaService.listMfaMethods(userId, tenantId);
    const mfaRequired = await mfaService.requiresMfa(userId, tenantId);

    res.json({
      mfaEnabled: methods.length > 0,
      mfaRequired,
      methods: methods.map(m => ({
        id: m.id,
        type: m.type,
        name: m.name,
        isPrimary: m.isPrimary,
        lastUsedAt: m.lastUsedAt,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error('[MFA Status] Error:', error);
    res.status(500).json({ error: 'Failed to retrieve MFA status' });
  }
};

// ── TOTP Setup ────────────────────────────────────────────────────────────────

/**
 * POST /api/mfa/totp/setup
 * Initialize TOTP setup - generates secret and QR code
 * 
 * Body: { name?: string }
 */
export const setupTOTP = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const tenantId = req.tenant?.id || req.user.tenantId;
    const userEmail = req.user.email || req.user.address;
    const { name = 'Authenticator App' } = req.body;

    const { secret, otpauth, methodName } = await mfaService.initializeTOTP(
      userId,
      tenantId,
      userEmail,
      name
    );

    // Generate QR code as data URL
    const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

    res.json({
      secret,
      qrCode: qrCodeDataUrl,
      otpauth,
      methodName,
      message: 'Scan the QR code with your authenticator app, then verify with a code to complete setup.',
    });
  } catch (error) {
    console.error('[TOTP Setup] Error:', error);
    res.status(500).json({ error: 'Failed to initialize TOTP setup' });
  }
};

/**
 * POST /api/mfa/totp/verify-setup
 * Complete TOTP setup by verifying a code
 * 
 * Body: { code: string }
 */
export const verifyTOTPSetup = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const tenantId = req.tenant?.id || req.user.tenantId;
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    const result = await mfaService.verifyAndRegisterTOTP(
      userId,
      tenantId,
      code,
      ipAddress,
      userAgent
    );

    res.json({
      success: true,
      method: result.method,
      backupCodes: result.backupCodes,
      message: 'TOTP authentication enabled successfully. Save your backup codes in a secure location.',
    });
  } catch (error) {
    console.error('[TOTP Verify Setup] Error:', error);
    
    if (error.message.includes('expired') || error.message.includes('not found')) {
      return res.status(400).json({ error: error.message });
    }
    
    if (error.message.includes('Invalid')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to verify TOTP setup' });
  }
};

/**
 * POST /api/mfa/totp/verify
 * Verify TOTP code for authentication
 * 
 * Body: { code: string }
 */
export const verifyTOTP = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const tenantId = req.tenant?.id || req.user.tenantId;
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    const result = await mfaService.verifyTOTP(
      userId,
      tenantId,
      code,
      ipAddress,
      userAgent
    );

    // Generate MFA token for subsequent requests
    const mfaToken = generateMfaToken(userId, tenantId, result.method);

    res.json({
      verified: true,
      method: result.method,
      mfaToken,
      expiresIn: '30m',
      ...(result.backupCodesRemaining !== undefined && {
        backupCodesRemaining: result.backupCodesRemaining,
        warning: result.backupCodesRemaining < 3 
          ? 'You are running low on backup codes. Consider regenerating them.'
          : undefined,
      }),
    });
  } catch (error) {
    console.error('[TOTP Verify] Error:', error);
    
    if (error.message.includes('locked')) {
      return res.status(429).json({ 
        error: error.message,
        locked: true,
      });
    }
    
    if (error.message.includes('not configured')) {
      return res.status(400).json({ error: error.message });
    }

    if (error.message.includes('Invalid') || error.message.includes('attempts remaining')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to verify TOTP code' });
  }
};

// ── WebAuthn Setup ────────────────────────────────────────────────────────────

/**
 * POST /api/mfa/webauthn/register-options
 * Generate WebAuthn registration options
 * 
 * Body: { name?: string }
 */
export const getWebAuthnRegistrationOptions = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const tenantId = req.tenant?.id || req.user.tenantId;
    const userEmail = req.user.email || req.user.address;
    const { name = 'Security Key' } = req.body;

    const options = await mfaService.generateWebAuthnRegistration(
      userId,
      tenantId,
      userEmail,
      name
    );

    res.json(options);
  } catch (error) {
    console.error('[WebAuthn Registration Options] Error:', error);
    res.status(500).json({ error: 'Failed to generate registration options' });
  }
};

/**
 * POST /api/mfa/webauthn/register-verify
 * Verify WebAuthn registration response
 * 
 * Body: { response: RegistrationResponseJSON }
 */
export const verifyWebAuthnRegistration = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const tenantId = req.tenant?.id || req.user.tenantId;
    const { response } = req.body;

    if (!response) {
      return res.status(400).json({ error: 'Registration response is required' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    const result = await mfaService.verifyWebAuthnRegistration(
      userId,
      tenantId,
      response,
      ipAddress,
      userAgent
    );

    res.json({
      success: true,
      method: result.method,
      message: 'WebAuthn credential registered successfully.',
    });
  } catch (error) {
    console.error('[WebAuthn Registration Verify] Error:', error);
    
    if (error.message.includes('expired') || error.message.includes('not found')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: error.message || 'Failed to verify WebAuthn registration' });
  }
};

/**
 * POST /api/mfa/webauthn/auth-options
 * Generate WebAuthn authentication options
 */
export const getWebAuthnAuthenticationOptions = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const tenantId = req.tenant?.id || req.user.tenantId;

    const options = await mfaService.generateWebAuthnAuthentication(userId, tenantId);

    res.json(options);
  } catch (error) {
    console.error('[WebAuthn Authentication Options] Error:', error);
    
    if (error.message.includes('No WebAuthn')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to generate authentication options' });
  }
};

/**
 * POST /api/mfa/webauthn/auth-verify
 * Verify WebAuthn authentication response
 * 
 * Body: { response: AuthenticationResponseJSON }
 */
export const verifyWebAuthnAuthentication = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const tenantId = req.tenant?.id || req.user.tenantId;
    const { response } = req.body;

    if (!response) {
      return res.status(400).json({ error: 'Authentication response is required' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');

    const result = await mfaService.verifyWebAuthnAuthentication(
      userId,
      tenantId,
      response,
      ipAddress,
      userAgent
    );

    // Generate MFA token for subsequent requests
    const mfaToken = generateMfaToken(userId, tenantId, result.method);

    res.json({
      verified: true,
      method: result.method,
      mfaToken,
      expiresIn: '30m',
    });
  } catch (error) {
    console.error('[WebAuthn Authentication Verify] Error:', error);
    
    if (error.message.includes('locked')) {
      return res.status(429).json({ 
        error: error.message,
        locked: true,
      });
    }
    
    if (error.message.includes('expired') || error.message.includes('not found')) {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ error: error.message || 'Failed to verify WebAuthn authentication' });
  }
};

// ── Management ────────────────────────────────────────────────────────────────

/**
 * GET /api/mfa/methods
 * List all MFA methods for the authenticated user
 */
export const listMfaMethods = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const tenantId = req.tenant?.id || req.user.tenantId;

    const methods = await mfaService.listMfaMethods(userId, tenantId);

    res.json({ methods });
  } catch (error) {
    console.error('[List MFA Methods] Error:', error);
    res.status(500).json({ error: 'Failed to retrieve MFA methods' });
  }
};

/**
 * DELETE /api/mfa/methods/:methodId
 * Remove an MFA method
 */
export const removeMfaMethod = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const tenantId = req.tenant?.id || req.user.tenantId;
    const { methodId } = req.params;

    await mfaService.removeMfaMethod(userId, tenantId, methodId);

    res.json({
      success: true,
      message: 'MFA method removed successfully',
    });
  } catch (error) {
    console.error('[Remove MFA Method] Error:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }

    res.status(500).json({ error: 'Failed to remove MFA method' });
  }
};

/**
 * GET /api/mfa/lockout-status
 * Check if user is currently locked out
 */
export const getLockoutStatus = async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const tenantId = req.tenant?.id || req.user.tenantId;

    const lockout = await mfaService.checkLockout(userId, tenantId);

    if (lockout.locked) {
      res.json({
        locked: true,
        lockedUntil: lockout.lockedUntil,
        remainingSeconds: Math.ceil(lockout.remainingMs / 1000),
      });
    } else {
      res.json({ locked: false });
    }
  } catch (error) {
    console.error('[Lockout Status] Error:', error);
    res.status(500).json({ error: 'Failed to check lockout status' });
  }
};

export default {
  getMfaStatus,
  setupTOTP,
  verifyTOTPSetup,
  verifyTOTP,
  getWebAuthnRegistrationOptions,
  verifyWebAuthnRegistration,
  getWebAuthnAuthenticationOptions,
  verifyWebAuthnAuthentication,
  listMfaMethods,
  removeMfaMethod,
  getLockoutStatus,
};
