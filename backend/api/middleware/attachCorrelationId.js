import { randomUUID } from 'crypto';
import { runWithContext, getCorrelationContext } from '../../lib/correlationId.js';
import { trace, context } from '@opentelemetry/api';

/**
 * Middleware attachCorrelationId:
 * Reads X-Correlation-Id header or generates crypto.randomUUID().
 * Stores { correlationId, traceId, spanId } in ALS.
 * Sets X-Correlation-Id on response header.
 */
export function attachCorrelationId(req, res, next) {
  const correlationId =
    req.headers['x-correlation-id'] ||
    req.headers['x-request-id'] ||
    randomUUID();

  // Set X-Correlation-Id on response
  res.setHeader('X-Correlation-Id', correlationId);
  req.correlationId = correlationId;

  // Retrieve OTEL span context if present
  const activeSpan = trace.getSpan(context.active());
  const spanContext = activeSpan?.spanContext();
  const traceId = spanContext?.traceId || '';
  const spanId = spanContext?.spanId || '';

  const store = {
    correlationId,
    traceId,
    spanId,
  };

  runWithContext(store, () => {
    next();
  });
}

export { getCorrelationContext };
export default attachCorrelationId;
