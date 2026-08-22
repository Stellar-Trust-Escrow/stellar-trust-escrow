import { jest } from '@jest/globals';
jest.mock('../../config/logger.js', () => ({ createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn() }) }));

describe('milestoneDagService', () => {
  let svc;
  beforeAll(async () => { svc = await import('../../services/milestoneDagService.js'); });

  const ms = [
    { id: 'a', title: 'A', dependsOn: [] },
    { id: 'b', title: 'B', dependsOn: ['a'] },
    { id: 'c', title: 'C', dependsOn: ['a', 'b'] },
  ];

  test('buildDag creates node map', () => {
    const nodes = svc.buildDag(ms);
    expect(nodes.size).toBe(3);
  });

  test('buildDag throws on unknown dependency', () => {
    expect(() => svc.buildDag([{ id: 'x', dependsOn: ['nonexistent'] }])).toThrow(/unknown/i);
  });

  test('detectCycles returns null for acyclic', () => {
    expect(svc.detectCycles(svc.buildDag(ms))).toBeNull();
  });

  test('detectCycles finds cycle', () => {
    const cyclic = [{ id: 'x', dependsOn: ['y'] }, { id: 'y', dependsOn: ['x'] }];
    const nodes = svc.buildDag(cyclic);
    expect(svc.detectCycles(nodes)).not.toBeNull();
  });

  test('topologicalSort returns a before b before c', () => {
    const order = svc.topologicalSort(svc.buildDag(ms));
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  test('topologicalSort throws on cyclic graph', () => {
    const cyclic = [{ id: 'p', dependsOn: ['q'] }, { id: 'q', dependsOn: ['p'] }];
    expect(() => svc.topologicalSort(svc.buildDag(cyclic))).toThrow(/cyclic/i);
  });

  test('getReadyMilestones returns only a when nothing completed', () => {
    const ready = svc.getReadyMilestones(svc.buildDag(ms), new Set());
    expect(ready.map(n => n.id)).toEqual(['a']);
  });

  test('getReadyMilestones returns b after a is completed', () => {
    const ready = svc.getReadyMilestones(svc.buildDag(ms), new Set(['a']));
    expect(ready.map(n => n.id)).toContain('b');
  });

  test('validateMilestonePlan rejects cycles', () => {
    const r = svc.validateMilestonePlan([{ id: 'p', dependsOn: ['q'] }, { id: 'q', dependsOn: ['p'] }]);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/cyclic/i);
  });

  test('validateMilestonePlan returns execution order for valid plan', () => {
    const r = svc.validateMilestonePlan(ms);
    expect(r.valid).toBe(true);
    expect(Array.isArray(r.executionOrder)).toBe(true);
    expect(r.executionOrder.indexOf('a')).toBeLessThan(r.executionOrder.indexOf('b'));
  });
});
