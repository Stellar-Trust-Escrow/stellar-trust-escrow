import { listFlags, isFeatureEnabled } from '../../services/featureFlags.js';

/**
 * Attaches an `activeFlags` map to `req.user` so controllers can branch
 * without making individual flag lookups.
 *
 * Usage: app.use(attachFeatureFlags) — place after authMiddleware.
 *
 * req.user.activeFlags = { 'new-dashboard': true, 'beta-payments': false, ... }
 */
export async function attachFeatureFlags(req, _res, next) {
  try {
    if (!req.user) return next();
    const flags = await listFlags();
    req.user.activeFlags = {};
    await Promise.all(
      flags.map(async (flag) => {
        req.user.activeFlags[flag.key] = await isFeatureEnabled(flag.key, req.user);
      }),
    );
  } catch {
    // Never block the request on a flag evaluation failure
  }
  next();
}
