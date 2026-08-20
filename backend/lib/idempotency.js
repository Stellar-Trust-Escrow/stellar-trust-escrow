const cache = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;

export const idempotencyMiddleware = (req, res, next) => {
  const key = req.headers['idempotency-key'];
  if (!key || !['POST', 'PATCH', 'PUT'].includes(req.method)) return next();

  const cacheKey = `${req.method}:${req.path}:${key}`;
  const cached = cache.get(cacheKey);

  if (cached) {
    if (cached.inFlight)
      return res
        .status(409)
        .json({
          error: {
            code: 'REQUEST_IN_FLIGHT',
            message: 'A request with this idempotency key is already in progress',
          },
        });
    return res.status(cached.status).json(cached.body);
  }

  cache.set(cacheKey, { inFlight: true });

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    cache.set(cacheKey, { inFlight: false, status: res.statusCode, body });
    setTimeout(() => cache.delete(cacheKey), TTL_MS);
    return originalJson(body);
  };

  next();
};
