/**
 * Role Guard Middleware — Granular RBAC
 *
 * Defines four platform roles and a permission map that binds each
 * role to the actions it may perform. Use checkPermission() to protect
 * individual routes.
 *
 * Usage:
 *   import { checkPermission } from '../middleware/roleGuard.js';
 *   router.post('/disputes/:id/resolve', auth, checkPermission('Arbitrator', 'resolve_dispute'), handler);
 *
 * Roles are read from req.user.roles (array). A user satisfies a
 * permission check if ANY of their roles grants the required action.
 * Admin implicitly satisfies every permission.
 */

import { createModuleLogger } from '../../config/logger.js';

const log = createModuleLogger('roleGuard');

// ── Role definitions ──────────────────────────────────────────────────────────

export const ROLES = Object.freeze({
  CLIENT: 'Client',
  FREELANCER: 'Freelancer',
  ARBITRATOR: 'Arbitrator',
  ADMIN: 'Admin',
});

/**
 * Permission map: role → Set of allowed action strings.
 * Extend this map as new actions are introduced.
 */
const PERMISSIONS = {
  [ROLES.CLIENT]: new Set([
    'create_escrow',
    'cancel_escrow',
    'approve_milestone',
    'raise_dispute',
    'view_own_escrow',
  ]),
  [ROLES.FREELANCER]: new Set(['submit_milestone', 'raise_dispute', 'view_own_escrow']),
  [ROLES.ARBITRATOR]: new Set(['resolve_dispute', 'view_dispute', 'view_own_escrow']),
  [ROLES.ADMIN]: new Set([
    // Admin is handled as a wildcard below — this set is for documentation only
    '*',
  ]),
};

/**
 * Returns true if the given role is permitted to perform the action.
 * @param {string} role
 * @param {string} action
 */
export function roleCanPerform(role, action) {
  if (role === ROLES.ADMIN) return true;
  return PERMISSIONS[role]?.has(action) ?? false;
}

/**
 * Returns true if any of the user's roles permits the action.
 * @param {string[]} roles
 * @param {string}   action
 */
export function hasPermission(roles, action) {
  return Array.isArray(roles) && roles.some((r) => roleCanPerform(r, action));
}

// ── Middleware factory ────────────────────────────────────────────────────────

/**
 * Express middleware that enforces role-based access control.
 *
 * Requires auth middleware to have already populated req.user.
 * req.user.roles must be a string[] of role names.
 *
 * @param {string} requiredRole — the minimum role category for this endpoint
 * @param {string} action       — the specific action being guarded
 */
export function checkPermission(requiredRole, action) {
  return (req, res, next) => {
    const user = req.user;
    const roles = user?.roles ?? (user?.role ? [user.role] : []);

    if (!user || roles.length === 0) {
      log.warn({ message: 'rbac_no_roles', action, requiredRole, path: req.path });
      return res.status(403).json({ error: 'Forbidden: no roles assigned.' });
    }

    // Check that the user holds the required role (or Admin)
    const holdsRole = roles.includes(requiredRole) || roles.includes(ROLES.ADMIN);
    if (!holdsRole) {
      log.warn({
        message: 'rbac_role_missing',
        action,
        requiredRole,
        userRoles: roles,
        address: user.address,
        path: req.path,
      });
      return res.status(403).json({ error: `Forbidden: requires ${requiredRole} role.` });
    }

    // Check that the role permits the specific action
    if (!hasPermission(roles, action)) {
      log.warn({
        message: 'rbac_action_denied',
        action,
        requiredRole,
        userRoles: roles,
        address: user.address,
        path: req.path,
      });
      return res.status(403).json({ error: `Forbidden: action '${action}' not permitted.` });
    }

    return next();
  };
}

export default { checkPermission, hasPermission, roleCanPerform, ROLES };
