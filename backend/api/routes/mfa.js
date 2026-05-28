/**
 * MFA Routes
 *
 * Endpoints for multi-factor authentication setup and verification.
 *
 * @module routes/mfa
 */

import express from 'express';
import mfaController from '../controllers/mfaController.js';
import authMiddleware from '../middleware/auth.js';
import { requireMfa } from '../middleware/mfaAuth.js';

const router = express.Router();

// All MFA routes require authentication
router.use(authMiddleware);

// ── Status & Management ───────────────────────────────────────────────────────

/**
 * GET /api/mfa/status
 * Get MFA status and available methods
 */
router.get('/status', mfaController.getMfaStatus);

/**
 * GET /api/mfa/methods
 * List all MFA methods for the authenticated user
 */
router.get('/methods', mfaController.listMfaMethods);

/**
 * DELETE /api/mfa/methods/:methodId
 * Remove an MFA method (requires MFA verification)
 */
router.delete('/methods/:methodId', requireMfa, mfaController.removeMfaMethod);

/**
 * GET /api/mfa/lockout-status
 * Check if user is currently locked out
 */
router.get('/lockout-status', mfaController.getLockoutStatus);

// ── TOTP (Time-based One-Time Password) ───────────────────────────────────────

/**
 * POST /api/mfa/totp/setup
 * Initialize TOTP setup - generates secret and QR code
 * Body: { name?: string }
 */
router.post('/totp/setup', mfaController.setupTOTP);

/**
 * POST /api/mfa/totp/verify-setup
 * Complete TOTP setup by verifying a code
 * Body: { code: string }
 */
router.post('/totp/verify-setup', mfaController.verifyTOTPSetup);

/**
 * POST /api/mfa/totp/verify
 * Verify TOTP code for authentication
 * Body: { code: string }
 */
router.post('/totp/verify', mfaController.verifyTOTP);

// ── WebAuthn (Hardware Security Keys) ─────────────────────────────────────────

/**
 * POST /api/mfa/webauthn/register-options
 * Generate WebAuthn registration options
 * Body: { name?: string }
 */
router.post('/webauthn/register-options', mfaController.getWebAuthnRegistrationOptions);

/**
 * POST /api/mfa/webauthn/register-verify
 * Verify WebAuthn registration response
 * Body: { response: RegistrationResponseJSON }
 */
router.post('/webauthn/register-verify', mfaController.verifyWebAuthnRegistration);

/**
 * POST /api/mfa/webauthn/auth-options
 * Generate WebAuthn authentication options
 */
router.post('/webauthn/auth-options', mfaController.getWebAuthnAuthenticationOptions);

/**
 * POST /api/mfa/webauthn/auth-verify
 * Verify WebAuthn authentication response
 * Body: { response: AuthenticationResponseJSON }
 */
router.post('/webauthn/auth-verify', mfaController.verifyWebAuthnAuthentication);

export default router;
