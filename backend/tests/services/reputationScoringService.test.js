import { jest, describe, test, expect, beforeAll } from '@jest/globals';

jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn() }),
}));

const svc = await import('../../services/reputationScoringService.js');

describe('reputationScoringService', () => {
  test('calculateReputation returns score and tier', () => {
    const r = svc.calculateReputation('GABC1234', { milestonesCompleted: 5, onTimeDelivery: 3 });
    expect(r.score).toBeGreaterThan(0);
    expect(r.tier).toBeTruthy();
    expect(r.badge).toBeTruthy();
  });

  test('score floored at 0 with negative stats', () => {
    const r = svc.calculateReputation('GABC1234', { disputesLost: 100 });
    expect(r.score).toBe(0);
  });

  test('Diamond tier for high score', () => {
    const r = svc.calculateReputation('GABC1234', { milestonesCompleted: 60 });
    expect(r.tier).toBe('Diamond');
  });

  test('breakdown only includes non-zero categories', () => {
    const r = svc.calculateReputation('GABC1234', { milestonesCompleted: 3 });
    expect(r.breakdown.every(item => item.count !== 0)).toBe(true);
  });

  test('nextTier is null at Diamond', () => {
    const r = svc.calculateReputation('GABC1234', { milestonesCompleted: 60 });
    expect(r.nextTier).toBeNull();
  });

  test('nextTier shows points needed for Bronze contributor', () => {
    const r = svc.calculateReputation('GABC1234', { milestonesCompleted: 1 });
    expect(r.nextTier).not.toBeNull();
    expect(r.nextTier.pointsNeeded).toBeGreaterThan(0);
  });

  test('getTierList returns all tiers', () => {
    const tiers = svc.getTierList();
    expect(tiers.length).toBeGreaterThanOrEqual(4);
    expect(tiers.some(t => t.name === 'Bronze')).toBe(true);
    expect(tiers.some(t => t.name === 'Diamond')).toBe(true);
  });

  test('getTierList entries have description field', () => {
    const tiers = svc.getTierList();
    expect(tiers.every(t => typeof t.description === 'string')).toBe(true);
  });

  test('throws on missing walletAddress', () => {
    expect(() => svc.calculateReputation(null, {})).toThrow('walletAddress');
  });

  test('throws on missing stats', () => {
    expect(() => svc.calculateReputation('GABC1234', null)).toThrow('stats');
  });

  test('compareReputations sorts higher scores first', () => {
    const high = { score: 200 };
    const low = { score: 50 };
    expect(svc.compareReputations(high, low)).toBeLessThan(0);
    expect(svc.compareReputations(low, high)).toBeGreaterThan(0);
  });
});
