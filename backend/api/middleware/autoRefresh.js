/**
 * Auto-Refresh Middleware
 * 
 * Automatically refreshes access tokens when they're close to expiring.
 * Provides seamless UX without requiring manual token refresh.
 */

import jwt from 'jsonwebtoken';
import refreshTokenService from '../../services/refreshTokenService.js';
import cookieUtils from '../../lib/cookieUtils.js';

const REFRESH_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes before expiry

/**
 * Middleware to auto-refresh access tokens
 * @param {object} options - Configuration options
 * @returns {function} Express middleware function
 */
function autoRefreshMiddleware(options = {}) {
  const {
    enableCookieRefresh = true,
    enableHeaderRefresh = true,
    refreshThreshold = REFRESH_THRESHOLD_MS
  } = options;

  return async (req, res, next) => {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    try {
      // Decode token without verification to check expiry
      const decoded = jwt.decode(token);
      
      if (!decoded || !decoded.exp) {
        return next();
      }

      const timeUntilExpiry = decoded.exp * 1000 - Date.now();
      
      // Only refresh if token is close to expiring
      if (timeUntilExpiry > refreshThreshold) {
        return next();
      }

      // Try to get refresh token from cookie or body
      let refreshToken = null;
      
      if (enableCookieRefresh) {
        refreshToken = cookieUtils.getRefreshTokenFromCookie(req);
      }
      
      if (!refreshToken && enableHeaderRefresh && req.body.refreshToken) {
        refreshToken = req.body.refreshToken;
      }

      if (!refreshToken) {
        return next();
      }

      // Attempt to refresh the token
      const deviceInfo = {
        type: 'auto_refresh',
        originalUserAgent: req.get('User-Agent')
      };

      const newTokens = await refreshTokenService.rotateRefreshToken(
        refreshToken,
        deviceInfo,
        req.ip,
        req.get('User-Agent')
      );

      // Set new access token in response header
      res.setHeader('X-New-Access-Token', newTokens.accessToken);
      
      // Optionally set new refresh token in cookie
      if (enableCookieRefresh) {
        cookieUtils.setRefreshTokenCookie(res, newTokens.refreshToken);
      }

      // Update the authorization header for downstream middleware
      req.headers.authorization = `Bearer ${newTokens.accessToken}`;
      
      console.log(`[AutoRefresh] Token refreshed for user ${decoded.userId}`);
      
    } catch (error) {
      // Auto-refresh failed, but continue with original token
      console.warn('[AutoRefresh] Failed to refresh token:', error.message);
    }
    
    next();
  };
}

/**
 * Middleware to handle token refresh errors gracefully
 */
function refreshErrorHandler() {
  return (err, req, res, next) => {
    if (err.name === 'TokenExpiredError') {
      // Check if we have a refresh token available
      const refreshToken = cookieUtils.getRefreshTokenFromCookie(req) || req.body.refreshToken;
      
      if (refreshToken) {
        return res.status(401).json({
          error: 'Access token expired',
          requiresRefresh: true,
          message: 'Please refresh your token'
        });
      }
    }
    
    next(err);
  };
}

/**
 * Helper function to check if token refresh is needed
 * @param {string} token - JWT token
 * @param {number} threshold - Time threshold in milliseconds
 * @returns {boolean} Whether refresh is needed
 */
function needsRefresh(token, threshold = REFRESH_THRESHOLD_MS) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      return false;
    }
    
    const timeUntilExpiry = decoded.exp * 1000 - Date.now();
    return timeUntilExpiry <= threshold;
  } catch {
    return false;
  }
}

/**
 * Express route to handle explicit token refresh requests
 */
function createRefreshRoute() {
  return async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token is required' });
      }

      const deviceInfo = {
        type: 'explicit_refresh',
        userAgent: req.get('User-Agent')
      };

      const tokens = await refreshTokenService.rotateRefreshToken(
        refreshToken,
        deviceInfo,
        req.ip,
        req.get('User-Agent')
      );

      // Set new refresh token in cookie if requested
      if (req.body.useCookie) {
        cookieUtils.setRefreshTokenCookie(res, tokens.refreshToken);
      }

      res.json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt
      });
      
    } catch (error) {
      console.error('[RefreshRoute] Error:', error.message);
      
      if (error.message.includes('blacklisted')) {
        return res.status(403).json({ error: 'Token has been revoked' });
      }
      if (error.message.includes('Invalid') || error.message.includes('expired')) {
        return res.status(403).json({ error: 'Invalid refresh token' });
      }
      
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

export default {
  autoRefreshMiddleware,
  refreshErrorHandler,
  needsRefresh,
  createRefreshRoute,
  REFRESH_THRESHOLD_MS
};
