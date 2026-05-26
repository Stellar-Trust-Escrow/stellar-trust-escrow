const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

function getAuthenticatedWalletAddress(req) {
  return req.user?.address ?? null;
}

function requireWalletAddress(req, res, next) {
  if (getAuthenticatedWalletAddress(req)) {
    return next();
  }

  return res.status(403).json({
    error: 'Authenticated user is not linked to a wallet address.',
  });
}

function authorizeAddressAccess(getRequestedAddress) {
  return (req, res, next) => {
    const authenticatedAddress = getAuthenticatedWalletAddress(req);
    if (!authenticatedAddress) {
      return res.status(403).json({
        error: 'Authenticated user is not linked to a wallet address.',
      });
    }

    const requestedAddress = getRequestedAddress(req);
    if (!requestedAddress) {
      return res.status(400).json({ error: 'Stellar address is required.' });
    }

    if (!STELLAR_ADDRESS_RE.test(requestedAddress)) {
      return res.status(400).json({ error: 'Invalid Stellar address' });
    }

    if (requestedAddress !== authenticatedAddress) {
      return res.status(403).json({ error: 'Forbidden: cannot access another wallet address.' });
    }

    return next();
  };
}

const authorizeParamAddress = (paramName = 'address') =>
  authorizeAddressAccess((req) => req.params?.[paramName]);

const authorizeBodyAddress = (fieldName = 'address') =>
  authorizeAddressAccess((req) => req.body?.[fieldName]);

export {
  STELLAR_ADDRESS_RE,
  authorizeAddressAccess,
  authorizeBodyAddress,
  authorizeParamAddress,
  getAuthenticatedWalletAddress,
  requireWalletAddress,
};
