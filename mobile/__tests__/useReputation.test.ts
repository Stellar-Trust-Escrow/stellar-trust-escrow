import { getReputationBadge } from '../hooks/useReputation';

describe('getReputationBadge', () => {
  it('returns NEW for score < 100', () => {
    expect(getReputationBadge(0).label).toBe('NEW');
    expect(getReputationBadge(99).label).toBe('NEW');
  });

  it('returns TRUSTED for score 100-249', () => {
    expect(getReputationBadge(100).label).toBe('TRUSTED');
    expect(getReputationBadge(249).label).toBe('TRUSTED');
  });

  it('returns VERIFIED for score 250-499', () => {
    expect(getReputationBadge(250).label).toBe('VERIFIED');
  });

  it('returns EXPERT for score 500-999', () => {
    expect(getReputationBadge(500).label).toBe('EXPERT');
  });

  it('returns ELITE for score >= 1000', () => {
    expect(getReputationBadge(1000).label).toBe('ELITE');
  });
});
