import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('service.reputationScoring');

const SCORE_WEIGHTS = {
  milestonesCompleted: 10,
  disputesWon: 15,
  disputesLost: -10,
  onTimeDelivery: 8,
  lateDelivery: -5,
  positiveReviews: 6,
  negativeReviews: -8,
  escrowsCreated: 3,
  escrowsCompleted: 5,
};

const TIER_THRESHOLDS = [
  { name: 'Diamond', min: 500, badge: 'Diamond' },
  { name: 'Platinum', min: 300, badge: 'Platinum' },
  { name: 'Gold', min: 150, badge: 'Gold' },
  { name: 'Silver', min: 60, badge: 'Silver' },
  { name: 'Bronze', min: 0, badge: 'Bronze' },
];

function computeScore(stats) {
  return Object.entries(SCORE_WEIGHTS).reduce((acc, [key, weight]) => {
    return acc + (stats[key] || 0) * weight;
  }, 0);
}

function getTier(score) {
  return TIER_THRESHOLDS.find(t => score >= t.min) || TIER_THRESHOLDS[TIER_THRESHOLDS.length - 1];
}

export function calculateReputation(walletAddress, stats) {
  if (!walletAddress) throw new Error('walletAddress is required');
  if (!stats || typeof stats !== 'object') throw new Error('stats object is required');

  const rawScore = computeScore(stats);
  const score = Math.max(0, rawScore);
  const tier = getTier(score);

  log.info({ message: 'reputation_calculated', walletAddress: walletAddress.slice(0, 8) + '…', score, tier: tier.name });

  return {
    walletAddress,
    score,
    tier: tier.name,
    badge: tier.badge,
    breakdown: Object.entries(SCORE_WEIGHTS)
      .filter(([key]) => (stats[key] || 0) !== 0)
      .map(([key, weight]) => ({ category: key, count: stats[key] || 0, contribution: (stats[key] || 0) * weight })),
    nextTier: (() => {
      const idx = TIER_THRESHOLDS.findIndex(t => t.name === tier.name);
      return idx > 0 ? { name: TIER_THRESHOLDS[idx - 1].name, pointsNeeded: TIER_THRESHOLDS[idx - 1].min - score } : null;
    })(),
  };
}

export function compareReputations(a, b) {
  return b.score - a.score;
}

export function getTierList() {
  return TIER_THRESHOLDS.map(t => ({ ...t, description: `${t.min}+ points` }));
}
