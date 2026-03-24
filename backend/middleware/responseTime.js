/**
 * Response-time profiling middleware
 *
 * Attaches X-Response-Time header to every response and logs slow
 * requests (> SLOW_THRESHOLD_MS) so they can be identified and optimized.
 */

/* eslint-disable no-undef */
const SLOW_THRESHOLD_MS = parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS || '500');

export default function responseTimeMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);

    if (durationMs > SLOW_THRESHOLD_MS) {
      console.warn(
        `[SLOW] ${req.method} ${req.originalUrl} — ${durationMs.toFixed(2)}ms (threshold: ${SLOW_THRESHOLD_MS}ms)`,
      );
    }
  });

  next();
}
