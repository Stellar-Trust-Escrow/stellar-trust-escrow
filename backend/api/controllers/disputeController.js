const stub = (_req, res) => res.status(501).json({ error: 'Not implemented' });

export default {
  listDisputes: stub,
  getResolutionHistory: stub,
  getDispute: stub,
  postEvidence: stub,
  listEvidence: stub,
  autoResolve: stub,
  getRecommendation: stub,
  postAppeal: stub,
  patchAppeal: stub,
};
