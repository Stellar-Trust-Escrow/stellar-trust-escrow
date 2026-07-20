/**
 * KYC gating middleware for escrow creation.
 *
 * If the escrow total exceeds the threshold (default 1000 USDC), the request
 * is blocked unless the sender has an Approved KYC record.
 */

export function requireKycAbove(thresholdUsdc) {
  return async (req, res, next) => {
    const amount = parseFloat(req.body?.totalAmount || '0');
    const threshold = thresholdUsdc ?? parseFloat(process.env.KYC_ESCROW_THRESHOLD_USDC || '1000');

    if (amount <= threshold) return next();

    const address = req.user?.stellarAddress || req.user?.address;
    if (!address) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { getKycStatus } = await import('../../services/kycService.js');
      const record = await getKycStatus({ address, tenantId: req.tenantId });
      if (record?.status === 'Approved') return next();
      return res.status(403).json({ error: 'KYC required', code: 'KYC_REQUIRED' });
    } catch (err) {
      return res.status(500).json({ error: 'KYC check failed' });
    }
  };
}
