import { randomUUID } from 'node:crypto';
import { getLogger, requestContext } from '../../config/logger.js';

const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Assigns a request id (header X-Request-Id or generated), forwards any
 * upstream X-Correlation-Id through to the response, exposes both on req,
 * and runs the rest of the chain inside AsyncLocalStorage.
 */
export function assignRequestContext(req, res, next) {
  const requestId =
    (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].trim()) ||
    randomUUID();

  // Forward correlation ID from upstream gateway / load balancer so distributed
  // traces can link spans across services without needing a tracing SDK.
  const correlationId =
    (typeof req.headers[CORRELATION_HEADER] === 'string' &&
      req.headers[CORRELATION_HEADER].trim()) ||
    requestId;

  req.id = requestId;
  req.correlationId = correlationId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Correlation-Id', correlationId);

  requestContext.run({ requestId, correlationId }, () => next());
}

/**
 * One structured JSON line per HTTP request when the response finishes.
 * Includes tenant slug when available so multi-tenant log queries can filter
 * by tenant without joining on request path.
 */
export function httpRequestLogger(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs) / 1e6;

    const pathOnly = req.originalUrl?.split('?')[0] || req.path;

    getLogger().info({
      message: 'http_request',
      type: 'http_request',
      requestId: req.id,
      correlationId: req.correlationId,
      tenantSlug: req.tenant?.slug ?? undefined,
      method: req.method,
      path: pathOnly,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 1000) / 1000,
      contentLength: res.getHeader('content-length') ?? undefined,
      userAgent: req.get('user-agent') ?? undefined,
    });
  });

  next();
}
