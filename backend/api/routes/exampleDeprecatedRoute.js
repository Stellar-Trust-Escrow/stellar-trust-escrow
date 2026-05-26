/**
 * Example: Deprecated Route Implementation
 * 
 * This file demonstrates how to properly deprecate API endpoints
 * using the deprecation middleware.
 * 
 * DO NOT USE IN PRODUCTION - This is for reference only
 */

import express from 'express';
import {
  deprecate,
  enforceSunset,
  addDeprecationToResponse,
} from '../middleware/deprecation.js';

const router = express.Router();

// ── Example 1: Deprecate a single endpoint ────────────────────────────────────
/**
 * @route  GET /api/legacy/users
 * @desc   Legacy user endpoint (deprecated)
 * @deprecated Use /api/v2/users instead
 */
router.get(
  '/legacy/users',
  deprecate({
    version: 'legacy',
    sunsetDate: new Date('2026-12-31'),
    replacement: '/api/v2/users',
    message: 'This legacy endpoint is deprecated. Please migrate to v2.',
  }),
  (req, res) => {
    res.json({
      users: [
        { id: 1, name: 'User 1' },
        { id: 2, name: 'User 2' },
      ],
    });
  },
);

// ── Example 2: Deprecate with sunset enforcement ──────────────────────────────
/**
 * @route  GET /api/old/data
 * @desc   Old data endpoint (will return 410 Gone after sunset)
 * @deprecated Sunset on 2026-06-01
 */
const oldDataSunset = new Date('2026-06-01');

router.get(
  '/old/data',
  enforceSunset(oldDataSunset), // Returns 410 Gone after sunset date
  deprecate({
    version: 'v1',
    sunsetDate: oldDataSunset,
    replacement: '/api/v2/data',
  }),
  (req, res) => {
    res.json({
      data: 'This endpoint will be removed soon',
    });
  },
);

// ── Example 3: Deprecate with response body notice ────────────────────────────
/**
 * @route  GET /api/v1/stats
 * @desc   Statistics endpoint with deprecation notice in response
 * @deprecated Includes deprecation info in response body
 */
router.get(
  '/v1/stats',
  addDeprecationToResponse({
    version: 'v1',
    sunsetDate: new Date('2027-03-31'),
    replacement: '/api/v2/stats',
    message: 'v1 stats endpoint is deprecated. v2 provides real-time data.',
  }),
  (req, res) => {
    res.json({
      totalUsers: 1000,
      totalEscrows: 500,
      // _deprecation field will be automatically added by middleware
    });
  },
);

// ── Example 4: Using deprecation presets ──────────────────────────────────────
/**
 * Apply deprecation to all routes in this router using preset
 * Uncomment to deprecate all routes at once
 */
// router.use(deprecateVersion(deprecationPresets.legacyUnversioned));

// ── Example 5: Conditional deprecation ────────────────────────────────────────
/**
 * @route  GET /api/conditional/feature
 * @desc   Feature that's only deprecated for certain conditions
 */
router.get('/conditional/feature', (req, res, next) => {
  // Example: Deprecate only for specific API versions or clients
  const clientVersion = req.get('X-Client-Version');
  
  if (clientVersion && clientVersion.startsWith('1.')) {
    // Apply deprecation middleware for old clients
    return deprecate({
      version: 'client-v1',
      sunsetDate: new Date('2026-09-30'),
      replacement: '/api/v2/feature',
      message: 'Please upgrade your client to v2.x',
    })(req, res, next);
  }
  
  next();
}, (req, res) => {
  res.json({
    feature: 'data',
  });
});

// ── Example 6: Multiple deprecation stages ────────────────────────────────────
/**
 * @route  GET /api/phased/endpoint
 * @desc   Endpoint with phased deprecation approach
 */
const phase1Date = new Date('2026-06-30'); // Warning phase
const phase2Date = new Date('2026-12-31'); // Sunset phase

router.get('/phased/endpoint', (req, res, next) => {
  const now = new Date();
  
  if (now > phase2Date) {
    // Phase 2: Enforce sunset
    return enforceSunset(phase2Date)(req, res, next);
  } else if (now > phase1Date) {
    // Phase 1: Strong warning
    return deprecate({
      version: 'v1',
      sunsetDate: phase2Date,
      replacement: '/api/v2/endpoint',
      message: 'URGENT: This endpoint will be removed soon. Please migrate immediately.',
    })(req, res, next);
  }
  
  // Before phase 1: Soft warning
  deprecate({
    version: 'v1',
    sunsetDate: phase2Date,
    replacement: '/api/v2/endpoint',
    message: 'This endpoint will be deprecated. Start planning your migration.',
  })(req, res, next);
}, (req, res) => {
  res.json({
    message: 'Phased deprecation example',
  });
});

export default router;
