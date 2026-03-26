/**
 * API deprecation middleware — RFC 8594 (Deprecation / Sunset headers).
 *
 * Usage:
 *
 *   import { deprecate } from './deprecation.js';
 *
 *   router.get('/old-endpoint',
 *     deprecate({
 *       deprecatedAt : new Date('2025-01-01'),
 *       sunsetAt     : new Date('2026-01-01'),
 *       link         : 'https://docs.example.com/migration',
 *       successor    : '/api/v2/new-endpoint',
 *     }),
 *     handler,
 *   );
 *
 * Headers set on each response:
 *   Deprecation : <RFC 7231 date>   — when the endpoint was deprecated
 *   Sunset      : <RFC 7231 date>   — when the endpoint will be removed
 *   Link        : <url>; rel="deprecation"
 *   Warning     : 299 - "<human readable message>"
 */

/** @type {Map<string, DeprecationPolicy>} */
const _registry = new Map();

/**
 * @typedef {object} DeprecationPolicy
 * @property {Date}        deprecatedAt
 * @property {Date|null}   sunsetAt
 * @property {string|null} link
 * @property {string|null} successor
 */

/**
 * Register a named deprecation policy so it can be inspected later
 * (e.g. via `deprecationDiscovery`).
 *
 * @param {string} id
 * @param {{ deprecatedAt: Date|string, sunsetAt?: Date|string, link?: string, successor?: string }} policy
 */
export function registerDeprecation(id, policy) {
  _registry.set(id, {
    deprecatedAt: new Date(policy.deprecatedAt),
    sunsetAt: policy.sunsetAt ? new Date(policy.sunsetAt) : null,
    link: policy.link ?? null,
    successor: policy.successor ?? null,
  });
}

/**
 * Factory: returns Express middleware that stamps every response with
 * RFC 8594-compliant deprecation and sunset headers.
 *
 * @param {object}        options
 * @param {Date|string}   options.deprecatedAt  When this endpoint was deprecated
 * @param {Date|string}  [options.sunsetAt]     When this endpoint will be removed
 * @param {string}       [options.link]         URL to migration docs
 * @param {string}       [options.successor]    Replacement endpoint path or URL
 * @returns {import('express').RequestHandler}
 */
export function deprecate({ deprecatedAt, sunsetAt, link, successor } = {}) {
  const deprecatedDate = new Date(deprecatedAt);
  const sunsetDate = sunsetAt ? new Date(sunsetAt) : null;

  return (_req, res, next) => {
    // RFC 8594 §4: Deprecation header — date the resource was deprecated
    res.setHeader('Deprecation', deprecatedDate.toUTCString());

    // RFC 8594 §3: Sunset header — date the resource will be removed
    if (sunsetDate) {
      res.setHeader('Sunset', sunsetDate.toUTCString());
    }

    // RFC 8288: Link header pointing to deprecation notice / migration docs
    if (link) {
      const existing = res.getHeader('Link');
      const deprecationLink = `<${link}>; rel="deprecation"`;
      res.setHeader('Link', existing ? `${existing}, ${deprecationLink}` : deprecationLink);
    }

    // RFC 7234 §5.5: Warning header — human-readable advisory
    let warningMsg = 'This endpoint is deprecated.';
    if (sunsetDate) {
      warningMsg += ` It will be removed after ${sunsetDate.toUTCString()}.`;
    }
    if (successor) {
      warningMsg += ` Please migrate to ${successor}.`;
    }
    res.setHeader('Warning', `299 - "${warningMsg}"`);

    next();
  };
}

/**
 * Returns the full deprecation registry as a plain object.
 * Dates are serialised to ISO-8601 strings.
 *
 * @returns {Record<string, { deprecatedAt: string, sunsetAt: string|null, link: string|null, successor: string|null }>}
 */
export function getDeprecationRegistry() {
  const out = {};
  for (const [id, policy] of _registry) {
    out[id] = {
      deprecatedAt: policy.deprecatedAt.toISOString(),
      sunsetAt: policy.sunsetAt?.toISOString() ?? null,
      link: policy.link,
      successor: policy.successor,
    };
  }
  return out;
}

/**
 * Express handler that exposes the deprecation registry as JSON.
 * Mount at `/.well-known/api-deprecations` or similar.
 *
 * @returns {import('express').RequestHandler}
 */
export function deprecationDiscovery() {
  return (_req, res) => {
    res.json(getDeprecationRegistry());
  };
}
