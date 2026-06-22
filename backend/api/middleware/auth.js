/**
 * Auth Middleware
 *
 * Validates Bearer JWT and checks jti against the session store.
 * Attaches req.user = { address, jti } on success.
 */

import jwt from 'jsonwebtoken';
import sessionService from '../../services/sessionService.js';
import { JWT_SECRET, JWT_ALGORITHM } from '../../config/secrets.js';

export default async function authMiddleware(req, res, next) {
  if (req.isAdmin) {
    req.user = req.user ?? { address: req.adminId ?? 'admin' };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    if (payload.jti) {
      const valid = await sessionService.isSessionValid(payload.jti);
      if (!valid) {
        return res.status(401).json({ error: 'Session revoked or expired. Please log in again.' });
      }
    }
    req.user = { address: payload.address, jti: payload.jti };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
    return res.status(401).json({ error: 'Invalid token' });
  }
}
