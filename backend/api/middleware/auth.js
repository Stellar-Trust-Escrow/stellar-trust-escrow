import jwt from 'jsonwebtoken';

const authMiddleware = (req, res, next) => {
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const secret = process.env.JWT_ACCESS_SECRET || 'fallback_access_secret';
    const decoded = jwt.verify(token, secret);
    if (req.tenant?.id && decoded.tenantId && decoded.tenantId !== req.tenant.id) {
      return res.status(403).json({ error: 'Token does not belong to this tenant.' });
    }
    req.user = decoded; // Contains { userId: user.id }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Access token expired.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

export default authMiddleware;
