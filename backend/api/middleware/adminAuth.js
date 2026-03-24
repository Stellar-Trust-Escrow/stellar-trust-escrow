/**
 * Admin Authentication Middleware
 *
 * Protects admin routes by validating the `x-admin-api-key` header against
 * the ADMIN_API_KEY environment variable. In production, replace this with
 * a proper JWT-based auth system tied to user roles.
 *
 * @module middleware/adminAuth
 */

/**
 * Middleware to restrict access to admin-only routes.
 *
 * Reads the `x-admin-api-key` header and compares it to the server's
 * ADMIN_API_KEY env var. Returns 401 if missing, 403 if invalid.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const adminAuth = (req, res, next) => {
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    // Server misconfiguration — do not expose details
    return res.status(500).json({ error: 'Admin authentication is not configured.' });
  }

  const providedKey = req.headers['x-admin-api-key'];

  if (!providedKey) {
    return res.status(401).json({ error: 'Admin API key required.' });
  }

  if (providedKey !== adminKey) {
    return res.status(403).json({ error: 'Invalid admin API key.' });
  }

  next();
};

export default adminAuth;
