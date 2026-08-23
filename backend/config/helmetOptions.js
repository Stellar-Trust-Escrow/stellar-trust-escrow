/**
 * helmetOptions.js
 *
 * Project-specific security header policy for helmet(), tuned to this
 * repo's actual needs rather than helmet's generic defaults. Referenced by
 * scripts/audit-security-headers.js — the audit's expectations and this
 * config are meant to be kept in sync deliberately (not duplicated
 * independently), so a CSP change here should be reflected in what the
 * audit script checks for, and vice versa.
 */

export const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"], // no 'unsafe-eval', no 'unsafe-inline'
      styleSrc: ["'self'", "'unsafe-inline'"], // inline styles needed by some UI libs
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://horizon-testnet.stellar.org', 'https://horizon.stellar.org'],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  strictTransportSecurity: {
    maxAge: 63072000, // 2 years, well above the 1-year (31536000s) minimum
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
  // noSniff (X-Content-Type-Options: nosniff) and referrerPolicy default to
  // sensible values in helmet 7 already — listed explicitly here so the
  // full policy is visible in one place rather than split between this
  // file and helmet's internal defaults.
  noSniff: true,
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
};

/**
 * helmet doesn't ship a Permissions-Policy directive itself (that header
 * was dropped from the "helmet" package in v6+ in favour of the
 * "permissions-policy" middleware being a userland concern) — set it
 * directly as a small dedicated middleware instead of pulling in another
 * dependency for one header.
 */
export function permissionsPolicyMiddleware(_req, res, next) {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  next();
}

export default helmetOptions;
