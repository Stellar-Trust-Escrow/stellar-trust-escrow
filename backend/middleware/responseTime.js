/**
 * Response-time profiling middleware
 *
 * Attaches X-Response-Time header to every response and logs slow
 * requests (> SLOW_THRESHOLD_MS) so they can be identified and optimized.
 */

const SLOW_THRESHOLD_MS = parseInt(process.env.SLOW_REQUEST_THRESHOLD_MS || '500', 10);

export default function responseTimeMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  res.setHeader('X-Response-Time', '0ms');

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;

    const log = req.log || console;

    if (durationMs > SLOW_THRESHOLD_MS) {
      log.warn(
        {
          requestId: req.id,
          method: req.method,
          endpoint: req.originalUrl,
          durationMs: durationMs.toFixed(2),
          thresholdMs: SLOW_THRESHOLD_MS,
        },
        'Slow request detected',
      );
    } else {
      log.debug(
        {
          requestId: req.id,
          method: req.method,
          endpoint: req.originalUrl,
          durationMs: durationMs.toFixed(2),
        },
        'Request timing',
      );
    }
  });

  next();
}
