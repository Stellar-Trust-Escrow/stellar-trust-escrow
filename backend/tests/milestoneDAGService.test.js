import { describe, expect, it } from '@jest/globals';
import { topologicalSort, validateDAG, canSubmitMilestone } from '../services/milestoneDAGService.js';

const linear = [
  { id: 'A', dependsOn: [] },
  { id: 'B', dependsOn: ['A'] },
  { id: 'C', dependsOn: ['B'] },
];

const parallel = [
  { id: 'A', dependsOn: [] },
  { id: 'B', dependsOn: [] },
  { id: 'C', dependsOn: ['A', 'B'] },
];

const cyclic = [
  { id: 'A', dependsOn: ['C'] },
  { id: 'B', dependsOn: ['A'] },
  { id: 'C', dependsOn: ['B'] },
];

describe('topologicalSort', () => {
  it('sorts linear chain A→B→C preserving order', () => {
    const { sorted, hasCycle } = topologicalSort(linear);
    expect(hasCycle).toBe(false);
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('B'));
    expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('C'));
  });

  it('sorts parallel milestones: A and B before C', () => {
    const { sorted, hasCycle } = topologicalSort(parallel);
    expect(hasCycle).toBe(false);
    expect(sorted.indexOf('A')).toBeLessThan(sorted.indexOf('C'));
    expect(sorted.indexOf('B')).toBeLessThan(sorted.indexOf('C'));
  });

  it('detects cycle A→B→C→A', () => {
    const { hasCycle } = topologicalSort(cyclic);
    expect(hasCycle).toBe(true);
  });

  it('handles empty input', () => {
    const { sorted, hasCycle } = topologicalSort([]);
    expect(hasCycle).toBe(false);
    expect(sorted).toHaveLength(0);
  });

  it('handles single milestone with no deps', () => {
    const { sorted, hasCycle } = topologicalSort([{ id: 'X', dependsOn: [] }]);
    expect(hasCycle).toBe(false);
    expect(sorted).toEqual(['X']);
  });
});

describe('validateDAG', () => {
  it('accepts a valid linear DAG', () => {
    const { valid, errors } = validateDAG(linear);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('accepts parallel milestones with shared dependency', () => {
    const { valid } = validateDAG(parallel);
    expect(valid).toBe(true);
  });

  it('rejects cyclic DAG with cycle error', () => {
    const { valid, errors } = validateDAG(cyclic);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('cycle'))).toBe(true);
  });

  it('rejects unknown dependency reference', () => {
    const { valid, errors } = validateDAG([{ id: 'A', dependsOn: ['DOES_NOT_EXIST'] }]);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects self-dependency', () => {
    const { valid, errors } = validateDAG([{ id: 'A', dependsOn: ['A'] }]);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('itself'))).toBe(true);
  });
});

describe('canSubmitMilestone', () => {
  it('returns true when all dependencies are APPROVED', () => {
    expect(canSubmitMilestone('B', linear, { A: 'APPROVED' })).toBe(true);
  });

  it('returns false when a dependency is PENDING', () => {
    expect(canSubmitMilestone('B', linear, { A: 'PENDING' })).toBe(false);
  });

  it('returns false when a dependency is missing from statusMap', () => {
    expect(canSubmitMilestone('B', linear, {})).toBe(false);
  });

  it('returns true for a milestone with no dependencies', () => {
    expect(canSubmitMilestone('A', linear, {})).toBe(true);
  });

  it('returns false for an unknown milestoneId', () => {
    expect(canSubmitMilestone('Z', linear, {})).toBe(false);
  });

  it('returns true when all multiple deps are APPROVED', () => {
    expect(canSubmitMilestone('C', parallel, { A: 'APPROVED', B: 'APPROVED' })).toBe(true);
  });

  it('returns false when only some of multiple deps are APPROVED', () => {
    expect(canSubmitMilestone('C', parallel, { A: 'APPROVED', B: 'PENDING' })).toBe(false);
  });
});
