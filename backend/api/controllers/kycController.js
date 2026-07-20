const noop = (_req, res) => res.status(501).json({ error: 'Not implemented' });

const kycController = {
  getToken: noop,
  getStatus: noop,
  webhook: noop,
  adminList: noop,
  get: noop,
  post: noop,
};

export default kycController;
