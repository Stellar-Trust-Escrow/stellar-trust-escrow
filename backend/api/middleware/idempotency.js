import crypto from 'crypto';
import cache from '../../lib/cache.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const IN_FLIGHT = new Set();

function isApiMutation(req) {
  return req.path.startsWith('/api/') && MUTATING_METHODS.has(req.method);
}

function isExcluded(req) {
  return /\/webhooks?\b/.test(req.path) || /\/payments\/webhook$/.test(req.path);
}

function requestFingerprint(req) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        method: req.method,
        path: req.originalUrl?.split('?')[0] ?? req.path,
        user: req.user?.userId ?? req.user?.address ?? null,
        tenant: req.tenant?.id ?? null,
        body: req.body ?? {},
      }),
    )
    .digest('hex');
}

function sendError(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

export default function idempotencyMiddleware(req, res, next) {
  if (!isApiMutation(req) || isExcluded(req)) return next();

  const key = req.headers['idempotency-key'];
  if (!key || Array.isArray(key) || typeof key !== 'string' || key.trim().length < 8) {
    return sendError(
      res,
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'A valid Idempotency-Key header is required for mutating API requests.',
    );
  }

  const cacheKey = `idempotency:${req.method}:${req.originalUrl}:${key.trim()}`;
  const fingerprint = requestFingerprint(req);

  Promise.resolve(cache.get(cacheKey))
    .then((stored) => {
      if (stored) {
        if (stored.fingerprint !== fingerprint) {
          return sendError(
            res,
            409,
            'IDEMPOTENCY_KEY_CONFLICT',
            'Idempotency-Key was already used with a different request.',
          );
        }
        res.setHeader('Idempotency-Replayed', 'true');
        return res.status(stored.statusCode).json(stored.body);
      }

      if (IN_FLIGHT.has(cacheKey)) {
        return sendError(
          res,
          409,
          'IDEMPOTENCY_REQUEST_IN_PROGRESS',
          'A request with this Idempotency-Key is already in progress.',
        );
      }

      IN_FLIGHT.add(cacheKey);
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode >= 200 && res.statusCode < 500) {
          cache
            .set(cacheKey, { fingerprint, statusCode: res.statusCode, body }, DEFAULT_TTL_SECONDS)
            .catch(() => null);
        }
        IN_FLIGHT.delete(cacheKey);
        return originalJson(body);
      };
      res.on('finish', () => IN_FLIGHT.delete(cacheKey));
      return next();
    })
    .catch(next);
}
