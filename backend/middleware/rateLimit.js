import rateLimit from 'express-rate-limit';

export const RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const DEFAULT_RATE_LIMIT_MAX = parseInt(
  process.env.RATE_LIMIT_MAX_REQUESTS_PER_MINUTE || '60',
  10,
);
export const LEADERBOARD_RATE_LIMIT_MAX = parseInt(
  process.env.LEADERBOARD_RATE_LIMIT_MAX_REQUESTS_PER_MINUTE || '30',
  10,
);

export function resolveRateLimitIdentity(req) {
  if (req.user?.id) {
    return { scope: 'user', value: String(req.user.id) };
  }

  if (req.user?.address) {
    return { scope: 'user', value: String(req.user.address) };
  }

  if (req.headers['x-user-id']) {
    return { scope: 'user', value: String(req.headers['x-user-id']) };
  }

  if (req.headers['x-user-address']) {
    return { scope: 'user', value: String(req.headers['x-user-address']) };
  }

  if (req.headers['x-admin-api-key']) {
    return { scope: 'user', value: 'admin' };
  }

  if (req.body?.address) {
    return { scope: 'user', value: String(req.body.address) };
  }

  if (req.params?.address) {
    return { scope: 'user', value: String(req.params.address) };
  }

  if (req.query?.address) {
    return { scope: 'user', value: String(req.query.address) };
  }

  return { scope: 'ip', value: req.ip || 'unknown' };
}

export function createRateLimitMiddleware({
  max,
  windowMs = RATE_LIMIT_WINDOW_MS,
  prefix = 'api',
  message = 'Too many requests, please try again later.',
} = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const identity = resolveRateLimitIdentity(req);
      return `${prefix}:${identity.scope}:${identity.value}`;
    },
    handler: (req, res, _next, options) => {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : undefined;

      if (retryAfterSeconds) {
        res.set('Retry-After', String(retryAfterSeconds));
      }

      res.status(options.statusCode).json({
        error: message,
        code: 'RATE_LIMIT_EXCEEDED',
      });
    },
  });
}

export const apiRateLimit = createRateLimitMiddleware({
  max: DEFAULT_RATE_LIMIT_MAX,
  prefix: 'api',
  message: 'Too many API requests, please slow down and try again in a minute.',
});

export const leaderboardRateLimit = createRateLimitMiddleware({
  max: LEADERBOARD_RATE_LIMIT_MAX,
  prefix: 'leaderboard',
  message: 'Too many leaderboard requests, please try again in a minute.',
});
