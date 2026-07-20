/**
 * Auth Middleware
 *
 * Validates Bearer JWT using keyRotationService.
 * Attaches req.user = { address, jti } on success.
 */

import jwt from 'jsonwebtoken';
import sessionService from '../../services/sessionService.js';
import keyRotationService from '../../services/keyRotationService.js';

export default async function authMiddleware(req, res, next) {
  if (req.isAdmin) {
    req.user = req.user ?? { address: req.adminId ?? 'admin' };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const token = authHeader.slice(7);
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token structure' });
  }

  try {
    let publicKey = null;
    const { kid } = decoded.header;
    const validKeys = await keyRotationService.getValidPublicKeys();
    
    if (kid) {
      const matched = validKeys.find(k => k.kid === kid);
      if (matched) publicKey = matched.publicKey;
    }

    let payload;
    if (publicKey) {
      // Fast path: we have the specific key
      payload = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    } else {
      // Slow path: try all valid public keys (handles rotation edge case)
      let lastErr = null;
      for (const k of validKeys) {
        try {
          payload = jwt.verify(token, k.publicKey, { algorithms: ['RS256'] });
          break; // Success
        } catch (e) {
          lastErr = e;
        }
      }
      if (!payload) throw lastErr || new Error('Invalid token');
    }

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
