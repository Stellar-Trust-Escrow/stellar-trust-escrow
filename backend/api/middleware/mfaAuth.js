/**
 * MFA Authentication Middleware
 *
 * Enforces multi-factor authentication for sensitive operations.
 * Validates that users have completed MFA verification before accessing
 * protected routes like admin panels and high-value operations.
 *
 * @module middleware/mfaAuth
 */

import jwt from 'jsonwebtoken';
import mfaService from '../../services/mfaService.js';
import cache from '../../lib/cache.js';

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_in_production';
const MFA_SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

/**
 * Middleware to require MFA verification for sensitive operations
 * 
 * Usage:
 *   router.post('/admin/users/:id/ban', authMiddleware, requireMfa, adminController.banUser)
 *   router.patch('/admin/settings', authMiddleware, requireMfa, adminController.updateSettings)
 */
export async function requireMfa(req, res, next) {
  try {
    // User must be authenticated first
    if (!req.user || !req.user.address) {
      return res.status(401).json({ 
        error: 'Authentication required',
        mfaRequired: false,
      });
    }

    // Get user from database to check MFA status
    const userId = req.user.userId || req.user.id;
    const tenantId = req.tenant?.id || req.user.tenantId;

    if (!userId) {
      return res.status(401).json({ 
        error: 'User ID not found in token',
        mfaRequired: false,
      });
    }

    // Check if user requires MFA
    const mfaRequired = await mfaService.requiresMfa(userId, tenantId);

    if (!mfaRequired) {
      // MFA not required for this user, proceed
      return next();
    }

    // Check if user has completed MFA in this session
    const mfaSessionKey = `mfa:session:${userId}`;
    const mfaSession = await cache.get(mfaSessionKey);

    if (mfaSession && mfaSession.verified) {
      // Valid MFA session exists, extend it
      await cache.set(mfaSessionKey, mfaSession, MFA_SESSION_DURATION / 1000);
      return next();
    }

    // Check for MFA token in header
    const mfaToken = req.headers['x-mfa-token'];
    
    if (!mfaToken) {
      return res.status(403).json({
        error: 'MFA verification required',
        mfaRequired: true,
        message: 'This operation requires multi-factor authentication. Please complete MFA verification.',
      });
    }

    // Verify MFA token
    let mfaPayload;
    try {
      mfaPayload = jwt.verify(mfaToken, JWT_SECRET);
    } catch (err) {
      return res.status(403).json({
        error: 'Invalid or expired MFA token',
        mfaRequired: true,
        message: 'Your MFA session has expired. Please verify again.',
      });
    }

    // Validate MFA token matches user
    if (mfaPayload.userId !== userId || mfaPayload.type !== 'mfa') {
      return res.status(403).json({
        error: 'Invalid MFA token',
        mfaRequired: true,
      });
    }

    // Create MFA session
    await cache.set(
      mfaSessionKey,
      {
        verified: true,
        userId,
        tenantId,
        method: mfaPayload.method,
        verifiedAt: new Date().toISOString(),
      },
      MFA_SESSION_DURATION / 1000
    );

    // Attach MFA info to request
    req.mfaVerified = true;
    req.mfaMethod = mfaPayload.method;

    next();
  } catch (error) {
    console.error('[MFA Middleware] Error:', error);
    return res.status(500).json({ error: 'Internal server error during MFA verification' });
  }
}

/**
 * Middleware to require MFA for high-value wallet operations
 * 
 * Usage:
 *   router.post('/escrow/:id/release', authMiddleware, requireMfaForHighValue, escrowController.release)
 */
export async function requireMfaForHighValue(req, res, next) {
  try {
    const amount = req.body.amount || req.params.amount || 0;
    const threshold = parseFloat(process.env.MFA_HIGH_VALUE_THRESHOLD || '10000');

    // If amount is below threshold, skip MFA
    if (parseFloat(amount) < threshold) {
      return next();
    }

    // Otherwise, require MFA
    return requireMfa(req, res, next);
  } catch (error) {
    console.error('[MFA High Value Middleware] Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Middleware to check if user has MFA enabled (informational only)
 * Adds req.mfaEnabled flag but doesn't block access
 */
export async function checkMfaStatus(req, res, next) {
  try {
    if (!req.user || !req.user.userId) {
      req.mfaEnabled = false;
      return next();
    }

    const userId = req.user.userId || req.user.id;
    const tenantId = req.tenant?.id || req.user.tenantId;

    const mfaRequired = await mfaService.requiresMfa(userId, tenantId);
    req.mfaEnabled = mfaRequired;

    next();
  } catch (error) {
    console.error('[MFA Status Check] Error:', error);
    req.mfaEnabled = false;
    next();
  }
}

/**
 * Generate MFA token after successful verification
 * This token is used in the x-mfa-token header for subsequent requests
 */
export function generateMfaToken(userId, tenantId, method) {
  return jwt.sign(
    {
      userId,
      tenantId,
      method,
      type: 'mfa',
      iat: Math.floor(Date.now() / 1000),
    },
    JWT_SECRET,
    { expiresIn: '30m' } // MFA token valid for 30 minutes
  );
}

export default {
  requireMfa,
  requireMfaForHighValue,
  checkMfaStatus,
  generateMfaToken,
};
