/**
 * milestoneGraphService — coverage gaps
 *
 * Tests for DAG construction, cycle detection, topological sort using the
 * actual exported API (CommonJS module).
 */

'use strict';

jest.mock('@prisma/client', () => {
  const PrismaClient = jest.fn().mockImplementation(() => ({
    milestone: { findMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(async (fn) => fn({})),
    $disconnect: jest.fn(),
  }));
  return { PrismaClient };
});

const svc = require('../../../services/milestoneGraphService.js');

const SIMPLE = [
  { id: 'a', dependsOn: [] },
  { id: 'b', dependsOn: ['a'] },
  { id: 'c', dependsOn: ['a', 'b'] },
];

describe('milestoneGraphService — buildDAG', () => {
  test('builds correct adjacency for simple chain', () => {
    const { adjacency, inDegree } = svc.buildDAG(SIMPLE);
    expect(adjacency.get('a')).toContain('b');
    expect(adjacency.get('a')).toContain('c');
    expect(inDegree.get('a')).toBe(0);
    expect(inDegree.get('b')).toBe(1);
    expect(inDegree.get('c')).toBe(2);
  });

  test('throws TypeError for empty array', () => {
    expect(() => svc.buildDAG([])).toThrow(TypeError);
  });

  test('throws TypeError for non-array input', () => {
    expect(() => svc.buildDAG(null)).toThrow(TypeError);
  });

  test('throws for unknown dependency reference', () => {
    expect(() =>
      svc.buildDAG([{ id: 'x', dependsOn: ['nonexistent'] }])
    ).toThrow(/unknown/i);
  });

  test('throws for milestone without a string id', () => {
    expect(() => svc.buildDAG([{ id: 123, dependsOn: [] }])).toThrow(TypeError);
  });

  test('single node with no deps', () => {
    const { adjacency, inDegree, nodeIds } = svc.buildDAG([{ id: 'solo', dependsOn: [] }]);
    expect(nodeIds.has('solo')).toBe(true);
    expect(inDegree.get('solo')).toBe(0);
    expect(adjacency.get('solo')).toHaveLength(0);
  });
});

describe('milestoneGraphService — validateDAG', () => {
  test('reports valid for acyclic graph', () => {
    const { adjacency, nodeIds } = svc.buildDAG(SIMPLE);
    const result = svc.validateDAG(adjacency, nodeIds);
    expect(result.valid).toBe(true);
    expect(result.cycles).toHaveLength(0);
  });

  test('detects direct cycle', () => {
    const cyclic = [
      { id: 'p', dependsOn: ['q'] },
      { id: 'q', dependsOn: ['p'] },
    ];
    const { adjacency, nodeIds } = svc.buildDAG(cyclic);
    const result = svc.validateDAG(adjacency, nodeIds);
    expect(result.valid).toBe(false);
    expect(result.cycles.length).toBeGreaterThan(0);
  });

  test('detects three-node cycle', () => {
    const cyclic = [
      { id: 'x', dependsOn: ['z'] },
      { id: 'y', dependsOn: ['x'] },
      { id: 'z', dependsOn: ['y'] },
    ];
    const { adjacency, nodeIds } = svc.buildDAG(cyclic);
    const result = svc.validateDAG(adjacency, nodeIds);
    expect(result.valid).toBe(false);
  });

  test('throws TypeError for non-Map adjacency', () => {
    expect(() => svc.validateDAG({}, new Set())).toThrow(TypeError);
  });
});

describe('milestoneGraphService — topologicalSort', () => {
  test('produces valid execution order for simple chain', () => {
    const dag = svc.buildDAG(SIMPLE);
    const order = svc.topologicalSort(dag);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  test('contains all node ids', () => {
    const dag = svc.buildDAG(SIMPLE);
    const order = svc.topologicalSort(dag);
    expect(order).toHaveLength(SIMPLE.length);
    for (const m of SIMPLE) expect(order).toContain(m.id);
  });

  test('throws on cyclic graph', () => {
    const cyclic = [
      { id: 'p', dependsOn: ['q'] },
      { id: 'q', dependsOn: ['p'] },
    ];
    const dag = svc.buildDAG(cyclic);
    expect(() => svc.topologicalSort(dag)).toThrow(/cycl/i);
  });

  test('handles single-node graph', () => {
    const dag = svc.buildDAG([{ id: 'solo', dependsOn: [] }]);
    expect(svc.topologicalSort(dag)).toEqual(['solo']);
  });

  test('parallel independent nodes all appear in result', () => {
    const parallel = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
      { id: 'c', dependsOn: [] },
    ];
    const dag = svc.buildDAG(parallel);
    const order = svc.topologicalSort(dag);
    expect(order).toHaveLength(3);
  });
});
