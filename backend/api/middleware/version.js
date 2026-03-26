/**
 * Middleware to attach API version to the request and add it to the response headers.
 * @param {string} version - The version string, e.g. 'v1'
 */
export const versioning = (version) => {
  return (req, res, next) => {
    req.apiVersion = version;
    res.setHeader('X-API-Version', version);
    next();
  };
};

/**
 * Middleware to warn clients about interacting with deprecated (unversioned) endpoints.
 * 
 * @deprecated Use the comprehensive deprecation middleware from './deprecation.js' instead.
 * This provides RFC-compliant headers, sunset dates, and better migration guidance.
 * 
 * @example
 * // Old way (deprecated)
 * app.use('/api', deprecatedRoute);
 * 
 * // New way (recommended)
 * import { deprecateVersion, deprecationPresets } from './deprecation.js';
 * app.use('/api', deprecateVersion(deprecationPresets.legacyUnversioned));
 */
export const deprecatedRoute = (req, res, next) => {
  res.setHeader(
    'Warning',
    '299 - "This version of the API is deprecated and will be removed in the future. Please migrate to /api/v1/"',
  );
  next();
};
