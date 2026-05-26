/**
 * Audit Middleware
 *
 * Automatically logs authentication events and HTTP state-change requests
 * (POST / PATCH / PUT / DELETE) after the response is sent.
 *
 * Usage:
 *   import auditMiddleware from '../middleware/audit.js';
 *   app.use(auditMiddleware);
 *
 * @module middleware/audit
 */

import auditService, { AuditCategory, AuditAction } from '../../services/auditService.js';

// Map route patterns to audit metadata so we can enrich log entries.
const ROUTE_MAP = [
  // Auth-like events inferred from path
  {
    method: 'POST',
    pattern: /\/api\/users\/login/,
    category: AuditCategory.AUTH,
    action: AuditAction.LOGIN,
  },
  {
    method: 'POST',
    pattern: /\/api\/users\/logout/,
    category: AuditCategory.AUTH,
    action: AuditAction.LOGOUT,
  },
  // Escrow
  {
    method: 'POST',
    pattern: /\/api\/escrows$/,
    category: AuditCategory.ESCROW,
    action: AuditAction.CREATE_ESCROW,
  },
  {
    method: 'PATCH',
    pattern: /\/api\/escrows\/[^/]+\/cancel/,
    category: AuditCategory.ESCROW,
    action: AuditAction.CANCEL_ESCROW,
  },
  // Milestones
  {
    method: 'POST',
    pattern: /\/api\/escrows\/[^/]+\/milestones$/,
    category: AuditCategory.MILESTONE,
    action: AuditAction.ADD_MILESTONE,
  },
  {
    method: 'POST',
    pattern: /\/milestones\/[^/]+\/submit/,
    category: AuditCategory.MILESTONE,
    action: AuditAction.SUBMIT_MILESTONE,
  },
  {
    method: 'POST',
    pattern: /\/milestones\/[^/]+\/approve/,
    category: AuditCategory.MILESTONE,
    action: AuditAction.APPROVE_MILESTONE,
  },
  {
    method: 'POST',
    pattern: /\/milestones\/[^/]+\/reject/,
    category: AuditCategory.MILESTONE,
    action: AuditAction.REJECT_MILESTONE,
  },
  // Disputes
  {
    method: 'POST',
    pattern: /\/api\/disputes$/,
    category: AuditCategory.DISPUTE,
    action: AuditAction.RAISE_DISPUTE,
  },
  {
    method: 'POST',
    pattern: /\/api\/disputes\/[^/]+\/resolve/,
    category: AuditCategory.DISPUTE,
    action: AuditAction.RESOLVE_DISPUTE,
  },
  // Admin
  {
    method: 'POST',
    pattern: /\/api\/admin\/users\/[^/]+\/suspend/,
    category: AuditCategory.ADMIN,
    action: AuditAction.SUSPEND_USER,
  },
  {
    method: 'POST',
    pattern: /\/api\/admin\/users\/[^/]+\/ban/,
    category: AuditCategory.ADMIN,
    action: AuditAction.BAN_USER,
  },
  {
    method: 'PATCH',
    pattern: /\/api\/admin\/settings/,
    category: AuditCategory.ADMIN,
    action: AuditAction.UPDATE_SETTINGS,
  },
  // Payments
  {
    method: 'POST',
    pattern: /\/api\/payments\/checkout/,
    category: AuditCategory.PAYMENT,
    action: AuditAction.PAYMENT_INITIATED,
  },
  {
    method: 'POST',
    pattern: /\/api\/payments\/[^/]+\/refund/,
    category: AuditCategory.PAYMENT,
    action: AuditAction.PAYMENT_REFUNDED,
  },
  // KYC
  {
    method: 'POST',
    pattern: /\/api\/kyc\/init/,
    category: AuditCategory.KYC,
    action: AuditAction.KYC_SUBMITTED,
  },
];

/**
 * Derive the actor from the request.
 * Extend this when JWT auth is added — read req.user.address instead.
 */
function resolveActor(req) {
  // Admin routes use the API key header; treat as "admin"
  if (req.headers['x-admin-api-key']) return 'admin';
  // Stellar address passed as a body or param field
  return req.body?.address || req.params?.address || 'anonymous';
}

/**
 * Extract a resource identifier from the request.
 */
function resolveResourceId(req) {
  return (
    req.params?.id || req.params?.address || req.params?.escrowId || req.body?.escrowId || null
  );
}

const auditMiddleware = (req, res, next) => {
  const match = ROUTE_MAP.find((r) => r.method === req.method && r.pattern.test(req.path));

  if (!match) return next();

  // Capture response status after it's sent
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    originalJson(body);

    auditService.log({
      category: match.category,
      action: match.action,
      actor: resolveActor(req),
      resourceId: resolveResourceId(req),
      metadata: res.statusCode >= 400 ? { error: body?.error } : undefined,
      statusCode: res.statusCode,
      ipAddress: req.ip,
    });

    return res;
  };

  next();
};

export default auditMiddleware;
