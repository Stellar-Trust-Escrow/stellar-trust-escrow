/**
 * Tracing Middleware
 *
 * Enriches the active OTel span (created by auto-instrumentation) with
 * HTTP-level attributes and propagates trace context on responses.
 *
 * Also attaches `req.span` so controllers/services can add custom attributes.
 *
 * @module middleware/tracingMiddleware
 */

/* eslint-disable no-undef */
import { trace, SpanStatusCode } from '@opentelemetry/api';

/**
 * Normalize Express route path — replaces dynamic segments with placeholders
 * to keep span name cardinality low.
 */
function normalizeRoute(req) {
  if (req.route?.path) {
    return (req.baseUrl || '') + req.route.path;
  }
  return req.path
    .replace(/\/[0-9]+/g, '/:id')
    .replace(/\/G[A-Z2-7]{55}/g, '/:address')
    .replace(/\/[0-9a-f]{64}/gi, '/:hash');
}

export default function tracingMiddleware(req, res, next) {
  // Skip tracing for internal endpoints
  if (req.path === '/metrics' || req.path === '/health') return next();

  const span = trace.getActiveSpan();
  if (!span) return next();

  // Attach span to request so downstream code can enrich it
  req.span = span;

  // Add HTTP semantic attributes
  span.setAttributes({
    'http.method': req.method,
    'http.url': req.originalUrl,
    'http.user_agent': req.headers['user-agent'] || '',
    'http.request_id': req.headers['x-request-id'] || '',
    'net.peer.ip': req.ip || req.socket?.remoteAddress || '',
  });

  // Propagate trace context to response headers for client-side correlation
  const spanContext = span.spanContext();
  if (spanContext.traceId) {
    res.setHeader('X-Trace-Id', spanContext.traceId);
    res.setHeader('X-Span-Id', spanContext.spanId);
  }

  res.on('finish', () => {
    const route = normalizeRoute(req);
    span.setAttributes({
      'http.route': route,
      'http.status_code': res.statusCode,
    });

    // Update span name to normalized route for better grouping in Jaeger
    span.updateName(`${req.method} ${route}`);

    if (res.statusCode >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${res.statusCode}` });
    } else if (res.statusCode >= 400) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${res.statusCode}` });
    }
  });

  next();
}
