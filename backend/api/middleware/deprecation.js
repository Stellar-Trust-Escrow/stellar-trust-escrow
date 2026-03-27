/**
 * API Deprecation Middleware
 * 
 * Provides comprehensive deprecation strategy with:
 * - Version headers
 * - Deprecation notices
 * - Sunset headers (RFC 8594)
 * - Migration guidance
 */

/**
 * Configuration for deprecated endpoints
 * @typedef {Object} DeprecationConfig
 * @property {string} version - API version being deprecated
 * @property {Date} sunsetDate - Date when the endpoint will be removed
 * @property {string} [replacement] - Suggested replacement endpoint
 * @property {string} [message] - Custom deprecation message
 * @property {string} [documentationUrl] - URL to migration guide
 */

/**
 * Middleware to mark an endpoint or route as deprecated
 * 
 * @param {DeprecationConfig} config - Deprecation configuration
 * @returns {Function} Express middleware
 * 
 * @example
 * // Deprecate a specific endpoint
 * router.get('/old-endpoint', 
 *   deprecate({
 *     version: 'v1',
 *     sunsetDate: new Date('2026-12-31'),
 *     replacement: '/api/v2/new-endpoint',
 *     message: 'This endpoint is deprecated. Please use v2 API.'
 *   }),
 *   controller.handler
 * );
 */
export const deprecate = (config) => {
  const {
    version,
    sunsetDate,
    replacement,
    message,
    documentationUrl = process.env.API_DOCS_URL || '/docs',
  } = config;

  // Validate configuration
  if (!version) {
    throw new Error('Deprecation config must include version');
  }
  if (!sunsetDate || !(sunsetDate instanceof Date)) {
    throw new Error('Deprecation config must include valid sunsetDate');
  }

  return (req, res, next) => {
    // Add Deprecation header (RFC 8594)
    res.setHeader('Deprecation', 'true');

    // Add Sunset header with RFC 7231 HTTP-date format
    res.setHeader('Sunset', sunsetDate.toUTCString());

    // Add Link header for documentation
    res.setHeader('Link', `<${documentationUrl}>; rel="deprecation"; type="text/html"`);

    // Build Warning header (RFC 7234)
    let warningMessage = message || `API ${version} is deprecated`;
    if (replacement) {
      warningMessage += `. Use ${replacement} instead`;
    }
    warningMessage += `. Sunset date: ${sunsetDate.toISOString().split('T')[0]}`;
    
    res.setHeader('Warning', `299 - "${warningMessage}"`);

    // Add custom headers for easier client parsing
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('X-API-Deprecated-Version', version);
    res.setHeader('X-API-Sunset-Date', sunsetDate.toISOString());
    
    if (replacement) {
      res.setHeader('X-API-Replacement', replacement);
    }

    // Log deprecation usage for monitoring
    console.warn('[DEPRECATION]', {
      path: req.path,
      method: req.method,
      version,
      sunsetDate: sunsetDate.toISOString(),
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });

    next();
  };
};

/**
 * Middleware to deprecate an entire API version
 * 
 * @param {DeprecationConfig} config - Deprecation configuration
 * @returns {Function} Express middleware
 * 
 * @example
 * // Deprecate all v1 routes
 * app.use('/api/v1', deprecateVersion({
 *   version: 'v1',
 *   sunsetDate: new Date('2026-12-31'),
 *   replacement: '/api/v2',
 *   message: 'API v1 is deprecated. Please migrate to v2.'
 * }));
 */
export const deprecateVersion = (config) => {
  return deprecate(config);
};

/**
 * Middleware to check if a deprecated endpoint has passed its sunset date
 * Returns 410 Gone if the sunset date has passed
 * 
 * @param {Date} sunsetDate - The sunset date
 * @returns {Function} Express middleware
 * 
 * @example
 * router.get('/old-endpoint',
 *   enforceSunset(new Date('2026-06-01')),
 *   controller.handler
 * );
 */
export const enforceSunset = (sunsetDate) => {
  if (!(sunsetDate instanceof Date)) {
    throw new Error('enforceSunset requires a valid Date object');
  }

  return (req, res, next) => {
    const now = new Date();
    
    if (now > sunsetDate) {
      return res.status(410).json({
        error: 'Gone',
        message: `This endpoint was sunset on ${sunsetDate.toISOString().split('T')[0]}`,
        sunsetDate: sunsetDate.toISOString(),
        documentation: process.env.API_DOCS_URL || '/docs',
      });
    }

    next();
  };
};

/**
 * Predefined deprecation configurations for common scenarios
 */
export const deprecationPresets = {
  /**
   * Deprecate unversioned legacy endpoints
   */
  legacyUnversioned: {
    version: 'unversioned',
    sunsetDate: new Date('2026-12-31'),
    replacement: '/api/v1',
    message: 'Unversioned API endpoints are deprecated. Please use versioned endpoints.',
  },

  /**
   * Deprecate v1 API
   */
  v1: {
    version: 'v1',
    sunsetDate: new Date('2027-06-30'),
    replacement: '/api/v2',
    message: 'API v1 is deprecated. Please migrate to v2 for improved features and performance.',
  },
};

/**
 * Utility to create a deprecation notice response body
 * Can be used in endpoint responses to provide detailed migration info
 * 
 * @param {DeprecationConfig} config - Deprecation configuration
 * @returns {Object} Deprecation notice object
 */
export const createDeprecationNotice = (config) => {
  const { version, sunsetDate, replacement, message, documentationUrl } = config;
  
  return {
    deprecated: true,
    version,
    sunsetDate: sunsetDate.toISOString(),
    daysUntilSunset: Math.ceil((sunsetDate - new Date()) / (1000 * 60 * 60 * 24)),
    message: message || `This API version (${version}) is deprecated`,
    replacement: replacement || null,
    documentation: documentationUrl || process.env.API_DOCS_URL || '/docs',
    migrationGuide: `${documentationUrl || '/docs'}/migration/${version}`,
  };
};

/**
 * Middleware to add deprecation info to response body
 * Useful for JSON API responses
 * 
 * @param {DeprecationConfig} config - Deprecation configuration
 * @returns {Function} Express middleware
 */
export const addDeprecationToResponse = (config) => {
  const notice = createDeprecationNotice(config);
  
  return (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);
    
    // Override json method to inject deprecation notice
    res.json = function (data) {
      // Add deprecation notice to response
      const responseWithNotice = {
        ...data,
        _deprecation: notice,
      };
      
      return originalJson(responseWithNotice);
    };
    
    next();
  };
};

export default {
  deprecate,
  deprecateVersion,
  enforceSunset,
  deprecationPresets,
  createDeprecationNotice,
  addDeprecationToResponse,
};
