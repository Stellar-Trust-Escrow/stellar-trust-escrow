import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('service.milestoneDag');

export function buildDag(milestones) {
  const nodes = new Map(milestones.map(m => [m.id, { ...m, dependsOn: m.dependsOn || [] }]));
  for (const [id, node] of nodes) {
    for (const dep of node.dependsOn) {
      if (!nodes.has(dep)) throw new Error(`Milestone ${id} depends on unknown milestone ${dep}`);
    }
  }
  return nodes;
}

export function detectCycles(nodes) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map([...nodes.keys()].map(k => [k, WHITE]));
  const cycle = [];

  function dfs(id) {
    color.set(id, GRAY);
    const node = nodes.get(id);
    for (const dep of node.dependsOn) {
      if (color.get(dep) === GRAY) { cycle.push(dep, id); return true; }
      if (color.get(dep) === WHITE && dfs(dep)) return true;
    }
    color.set(id, BLACK);
    return false;
  }

  for (const id of nodes.keys()) {
    if (color.get(id) === WHITE && dfs(id)) return cycle;
  }
  return null;
}

export function topologicalSort(nodes) {
  const cycle = detectCycles(nodes);
  if (cycle) throw new Error(`Cyclic dependency detected: ${cycle.join(' → ')}`);

  const visited = new Set();
  const result = [];

  function visit(id) {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodes.get(id);
    for (const dep of node.dependsOn) visit(dep);
    result.push(id);
  }

  for (const id of nodes.keys()) visit(id);
  return result;
}

export function getReadyMilestones(nodes, completedIds = new Set()) {
  const order = topologicalSort(nodes);
  return order.filter(id => {
    if (completedIds.has(id)) return false;
    const node = nodes.get(id);
    return node.dependsOn.every(dep => completedIds.has(dep));
  }).map(id => nodes.get(id));
}

export function validateMilestonePlan(milestones) {
  const nodes = buildDag(milestones);
  const cycle = detectCycles(nodes);
  if (cycle) return { valid: false, error: `Cyclic dependency: ${cycle.join(' → ')}` };
  const order = topologicalSort(nodes);
  log.info({ message: 'dag_validated', count: milestones.length, order });
  return { valid: true, executionOrder: order };
}
