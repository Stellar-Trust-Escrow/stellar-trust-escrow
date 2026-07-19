import { appendAuditEntry } from '../../services/auditService.js';

export default function auditLog(options = {}) {
  const { skip } = options;

  return (req, res, next) => {
    // Only intercept state-mutating requests
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    // Check skip function if provided
    if (skip && skip(req)) {
      return next();
    }

    res.on('finish', () => {
      // Must not block the response
      const action = req.method;
      const targetAddress = req.path;
      const performedBy = req.user?.id || 'anonymous';
      const escrowId = req.body?.escrowId;
      const tenantId = req.user?.tenantId; // If available

      const metadata = {
        statusCode: res.statusCode,
      };

      appendAuditEntry({
        action,
        targetAddress,
        reason: 'API state mutation',
        performedBy,
        escrowId,
        metadata,
        tenantId
      });
    });

    next();
  };
}
