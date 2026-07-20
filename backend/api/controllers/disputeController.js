const noop = (_req, res) => res.status(501).json({ error: 'Not implemented' });

const disputeController = {
  listDisputes: noop,
  getResolutionHistory: noop,
  getDispute: noop,
  getRecommendation: noop,
  listEvidence: noop,
  postEvidence: noop,
  uploadEvidence: noop,
  postAppeal: noop,
  patchAppeal: noop,
  autoResolve: noop,
};

export default disputeController;
