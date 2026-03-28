import jwt from 'jsonwebtoken';
import tokenBlacklistService from '../../services/tokenBlacklistService.js';

const authMiddleware = async (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    // Check if token is blacklisted
    const isBlacklisted = await tokenBlacklistService.isTokenBlacklisted(token, 'access');
    if (isBlacklisted) {
      const metadata = await tokenBlacklistService.getBlacklistMetadata(token, 'access');
      return res.status(403).json({ 
        error: 'Token has been revoked for security reasons',
        reason: metadata?.reason || 'security_issue'
      });
    }

    const secret = process.env.JWT_ACCESS_SECRET || 'fallback_access_secret';
    const decoded = jwt.verify(token, secret);
    
    // Validate token type
    if (decoded.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type.' });
    }
    
    // Check tenant context
    if (req.tenant?.id && decoded.tenantId && decoded.tenantId !== req.tenant.id) {
      return res.status(403).json({ error: 'Token does not belong to this tenant.' });
    }
    
    req.user = decoded; // Contains { userId: user.id, tenantId: user.tenantId, type: 'access' }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

export default authMiddleware;
