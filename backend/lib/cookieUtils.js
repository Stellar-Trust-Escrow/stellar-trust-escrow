/**
 * Secure Cookie Utility
 * 
 * Provides secure cookie handling with httpOnly, SameSite=Strict,
 * and other security best practices for refresh token storage.
 */

/**
 * Set a secure httpOnly cookie
 * @param {object} res - Express response object
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {object} options - Cookie options
 */
function setSecureCookie(res, name, value, options = {}) {
  const defaultOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    ...options
  };

  res.cookie(name, value, defaultOptions);
}

/**
 * Set refresh token in secure cookie
 * @param {object} res - Express response object
 * @param {string} refreshToken - Refresh token value
 */
function setRefreshTokenCookie(res, refreshToken) {
  setSecureCookie(res, 'refreshToken', refreshToken, {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/api/auth/refresh'
  });
}

/**
 * Clear refresh token cookie
 * @param {object} res - Express response object
 */
function clearRefreshTokenCookie(res) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/api/auth/refresh'
  });
}

/**
 * Get refresh token from request cookies
 * @param {object} req - Express request object
 * @returns {string|null} Refresh token or null
 */
function getRefreshTokenFromCookie(req) {
  return req.cookies?.refreshToken || null;
}

/**
 * Set access token in secure cookie (optional, for SPA scenarios)
 * @param {object} res - Express response object
 * @param {string} accessToken - Access token value
 */
function setAccessTokenCookie(res, accessToken) {
  setSecureCookie(res, 'accessToken', accessToken, {
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: '/'
  });
}

/**
 * Clear access token cookie
 * @param {object} res - Express response object
 */
function clearAccessTokenCookie(res) {
  res.clearCookie('accessToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/'
  });
}

/**
 * Set CSRF token cookie (for double-submit cookie pattern)
 * @param {object} res - Express response object
 * @param {string} csrfToken - CSRF token value
 */
function setCSRFCookie(res, csrfToken) {
  res.cookie('csrfToken', csrfToken, {
    httpOnly: false, // JavaScript needs to read this
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/',
    maxAge: 15 * 60 * 1000 // 15 minutes
  });
}

/**
 * Clear all auth cookies
 * @param {object} res - Express response object
 */
function clearAllAuthCookies(res) {
  clearRefreshTokenCookie(res);
  clearAccessTokenCookie(res);
  res.clearCookie('csrfToken', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Strict',
    path: '/'
  });
}

/**
 * Cookie configuration middleware
 * Adds cookie-parser middleware with secure settings
 */
function cookieSecurityMiddleware() {
  return (req, res, next) => {
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    next();
  };
}

export default {
  setSecureCookie,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromCookie,
  setAccessTokenCookie,
  clearAccessTokenCookie,
  setCSRFCookie,
  clearAllAuthCookies,
  cookieSecurityMiddleware
};
