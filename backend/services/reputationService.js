const BADGE_THRESHOLDS = {
  TRUSTED: 100,
  VERIFIED: 250,
  EXPERT: 500,
  ELITE: 1000,
};

const getReputationByAddress = async (_address) => {
  throw new Error('getReputationByAddress not implemented - see Issue #25');
};

const getBadge = (_score) => {
  return 'NEW';
};

const computeCompletionRate = (_completed, _disputed) => {
  return 0;
};

const getLeaderboard = async (_limit = 20, _page = 1) => {
  throw new Error('getLeaderboard not implemented - see Issue #22');
};

const getPercentileRank = async (_address) => {
  throw new Error('getPercentileRank not implemented - see Issue #28');
};

export { BADGE_THRESHOLDS, computeCompletionRate, getBadge, getLeaderboard, getPercentileRank, getReputationByAddress };

export default {
  getReputationByAddress,
  getBadge,
  computeCompletionRate,
  getLeaderboard,
  getPercentileRank,
  BADGE_THRESHOLDS,
};
