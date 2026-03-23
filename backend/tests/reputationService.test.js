import { BADGE_THRESHOLDS } from '../services/reputationService.js';

describe('BADGE_THRESHOLDS', () => {
  it('has the expected tier values', () => {
    expect(BADGE_THRESHOLDS.TRUSTED).toBe(100);
    expect(BADGE_THRESHOLDS.VERIFIED).toBe(250);
    expect(BADGE_THRESHOLDS.EXPERT).toBe(500);
    expect(BADGE_THRESHOLDS.ELITE).toBe(1000);
  });
});
