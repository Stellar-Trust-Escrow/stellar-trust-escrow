import { renderHook } from '@testing-library/react';
import { useReputation, getBadgeFromScore } from '../../hooks/useReputation';

describe('getBadgeFromScore', () => {
  it('returns ELITE for score >= 1000', () => {
    expect(getBadgeFromScore(1000)).toBe('ELITE');
    expect(getBadgeFromScore(1500)).toBe('ELITE');
  });

  it('returns EXPERT for score >= 500', () => {
    expect(getBadgeFromScore(500)).toBe('EXPERT');
    expect(getBadgeFromScore(999)).toBe('EXPERT');
  });

  it('returns VERIFIED for score >= 250', () => {
    expect(getBadgeFromScore(250)).toBe('VERIFIED');
    expect(getBadgeFromScore(499)).toBe('VERIFIED');
  });

  it('returns TRUSTED for score >= 100', () => {
    expect(getBadgeFromScore(100)).toBe('TRUSTED');
    expect(getBadgeFromScore(249)).toBe('TRUSTED');
  });

  it('returns NEW for score < 100', () => {
    expect(getBadgeFromScore(0)).toBe('NEW');
    expect(getBadgeFromScore(99)).toBe('NEW');
  });
});

describe('useReputation', () => {
  it('returns default values when address is null', () => {
    const { result } = renderHook(() => useReputation(null));
    expect(result.current.reputation).toBeNull();
    expect(result.current.badge).toBe('NEW');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('returns error when address is provided (not yet implemented)', () => {
    const { result } = renderHook(() => useReputation('GABC123'));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error.message).toMatch(/not implemented/i);
  });

  it('returns isLoading false', () => {
    const { result } = renderHook(() => useReputation('GABC123'));
    expect(result.current.isLoading).toBe(false);
  });
});
