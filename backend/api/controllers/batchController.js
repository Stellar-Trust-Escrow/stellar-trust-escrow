import supertest from 'supertest';
import { ROLES } from '../middleware/roleGuard.js';
import { trackUsage } from '../middleware/rateLimiter.js';
import { RATE_LIMIT_WINDOW_MS } from '../../config/rateLimits.js';

const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE || '20', 10);
const MAX_ITEM_BODY_BYTES = 64 * 1024; // 64 KB per sub-request body
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Routes permitted inside a batch request and the minimum role required.
 * Admin routes (/api/admin/*) are intentionally absent — they are always blocked.
 * minRole: null means any caller may target this route; the route handler still
 * enforces its own authentication.
 */
const BATCH_ALLOWED_ROUTES = [
  { pattern: /^\/api\/health(\/|$)/, minRole: null },
  { pattern: /^\/api\/auth(\/|$)/, minRole: null },
  { pattern: /^\/api\/escrows(\/|$)/, minRole: null },
  { pattern: /^\/api\/users(\/|$)/, minRole: null },
  { pattern: /^\/api\/disputes(\/|$)/, minRole: null },
  { pattern: /^\/api\/reputation(\/|$)/, minRole: null },
  { pattern: /^\/api\/notifications(\/|$)/, minRole: null },
  { pattern: /^\/api\/events(\/|$)/, minRole: null },
  { pattern: /^\/api\/webhooks(\/|$)/, minRole: null },
  { pattern: /^\/api\/kyc(\/|$)/, minRole: null },
  { pattern: /^\/api\/payments(\/|$)/, minRole: null },
  { pattern: /^\/api\/relayer(\/|$)/, minRole: null },
  { pattern: /^\/api\/audit(\/|$)/, minRole: null },
  { pattern: /^\/api\/compliance(\/|$)/, minRole: null },
  { pattern: /^\/api\/incidents(\/|$)/, minRole: null },
  { pattern: /^\/api\/search(\/|$)/, minRole: null },
  { pattern: /^\/api\/chat(\/|$)/, minRole: null },
];

const ADMIN_ROUTE_RE = /^\/api\/admin(\/|$)/;
const BATCH_ROUTE_RE = /\/api\/batch(\/|$)/;

function getUserRoles(req) {
  return req.user?.roles ?? (req.user?.role ? [req.user.role] : []);
}

/**
 * Returns a per-item error object if the route is forbidden, or null if allowed.
 */
function checkRoutePermission(url, userRoles) {
  if (ADMIN_ROUTE_RE.test(url)) {
    return { status: 403, body: { error: 'Admin routes are not permitted in batch requests.' } };
  }

  const entry = BATCH_ALLOWED_ROUTES.find(({ pattern }) => pattern.test(url));
  if (!entry) {
    return { status: 403, body: { error: `Route not permitted in batch requests: ${url}` } };
  }

  if (entry.minRole !== null) {
    const roles = Array.isArray(userRoles) ? userRoles : [];
    const hasRole = roles.includes(entry.minRole) || roles.includes(ROLES.ADMIN);
    if (!hasRole) {
      return {
        status: 403,
        body: { error: `Insufficient role for batch request to: ${url}` },
      };
    }
  }

  return null;
}

async function dispatchRequest(app, { method = 'GET', url, body, headers = {} }, parentReq) {
  const upperMethod = method.toUpperCase();
  if (!ALLOWED_METHODS.has(upperMethod)) {
    return { status: 400, body: { error: `Method not allowed: ${method}` } };
  }

  // Per-item body size guard: reject before dispatching
  if (body !== undefined && body !== null) {
    const serialized = JSON.stringify(body);
    if (serialized.length > MAX_ITEM_BODY_BYTES) {
      return { status: 413, body: { error: 'Sub-request body exceeds the 64 KB limit.' } };
    }
  }

  const userRoles = getUserRoles(parentReq);
  const permissionError = checkRoutePermission(url, userRoles);
  if (permissionError) return permissionError;

  // Propagate parent auth unless the sub-request explicitly supplies its own
  const authHeader = parentReq.headers['authorization'];
  if (authHeader && !headers['authorization'] && !headers['Authorization']) {
    headers = { ...headers, authorization: authHeader };
  }

  // Signal to route handlers that this is a batch sub-request (recursive batch guard)
  headers = { ...headers, 'x-batch-request': '1' };

  // Count each sub-request against the user's sliding-window rate limit
  const userId = parentReq.user?.id || parentReq.user?.address;
  if (userId) {
    trackUsage(`api:user:${userId}`, RATE_LIMIT_WINDOW_MS);
  }

  try {
    const agent = supertest(app)[upperMethod.toLowerCase()](url);

    for (const [key, value] of Object.entries(headers)) {
      agent.set(key, value);
    }

    if (body && (upperMethod === 'POST' || upperMethod === 'PUT' || upperMethod === 'PATCH')) {
      agent.send(body);
    }

    const response = await agent;
    return { status: response.status, body: response.body };
  } catch (err) {
    return { status: 500, body: { error: err.message } };
  }
}

export async function handleBatch(req, res) {
  const requests = req.body;

  if (!Array.isArray(requests)) {
    return res.status(400).json({ error: 'Request body must be an array.' });
  }

  if (requests.length > MAX_BATCH_SIZE) {
    return res.status(400).json({
      error: `Batch size ${requests.length} exceeds maximum allowed (${MAX_BATCH_SIZE}).`,
    });
  }

  // Reject the whole batch if any item targets /api/batch (prevents recursive batching)
  const hasRecursivePath = requests.some((item) => BATCH_ROUTE_RE.test(item?.url ?? ''));
  if (hasRecursivePath) {
    return res.status(400).json({ error: 'Recursive batch requests are not permitted.' });
  }

  const results = await Promise.allSettled(
    requests.map((item) => dispatchRequest(req.app, item, req)),
  );

  const responses = results.map((result) =>
    result.status === 'fulfilled'
      ? result.value
      : { status: 500, body: { error: result.reason?.message || 'Internal error' } },
  );

  return res.status(200).json(responses);
}
