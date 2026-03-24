/**
 * Response-time profiling middleware
 *
 * Attaches X-Response-Time header to every response and logs slow
 * requests (> SLOW_THRESHOLD_MS) so they can be identified and optimized.
 */

import { getLogger } from '../config/logger.js';

const SLOW_THRESHOLD_MS = parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS || '500');

export default function responseTimeMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);

    if (durationMs > SLOW_THRESHOLD_MS) {
      const pathOnly = req.originalUrl?.split('?')[0];
      getLogger().warn({
        message: 'slow_request',
        method: req.method,
        path: pathOnly,
        durationMs: Math.round(durationMs * 1000) / 1000,
        thresholdMs: SLOW_THRESHOLD_MS,
      });
    }
  });

  next();
}
