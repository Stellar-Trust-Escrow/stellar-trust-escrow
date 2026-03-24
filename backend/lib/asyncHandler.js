/**
 * Wraps an async route handler so any thrown error is forwarded to next(err).
 * Eliminates repetitive try/catch boilerplate in controllers.
 *
 * @param {Function} fn - Async Express route handler (req, res, next) => Promise
 * @returns {Function} Express middleware that catches rejections and calls next(err)
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export default asyncHandler;
