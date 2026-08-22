import { createModuleLogger } from '../config/logger.js';

const log = createModuleLogger('service.milestoneDAG');

/**
 * Topological sort using Kahn's algorithm.
 * @param {Array<{id: string, dependsOn: string[]}>} milestones
 * @returns {{ sorted: string[], hasCycle: boolean }}
 */
export function topologicalSort(milestones) {
  const inDegree = new Map();
  const adj = new Map();

  for (const m of milestones) {
    if (!inDegree.has(m.id)) inDegree.set(m.id, 0);
    if (!adj.has(m.id)) adj.set(m.id, []);
    for (const dep of (m.dependsOn || [])) {
      if (!adj.has(dep)) adj.set(dep, []);
      adj.get(dep).push(m.id);
      inDegree.set(m.id, (inDegree.get(m.id) || 0) + 1);
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted = [];
  while (queue.length > 0) {
    const node = queue.shift();
    sorted.push(node);
    for (const neighbor of (adj.get(node) || [])) {
      const newDeg = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  const hasCycle = sorted.length < milestones.length;
  if (hasCycle) {
    log.warn({ message: 'dag_cycle_detected', totalMilestones: milestones.length, sortedCount: sorted.length });
  }
  return { sorted, hasCycle };
}

/**
 * Validate a milestone dependency graph.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDAG(milestones) {
  const errors = [];
  const ids = new Set(milestones.map(m => m.id));

  for (const m of milestones) {
    for (const dep of (m.dependsOn || [])) {
      if (dep === m.id) {
        errors.push(`Milestone "${m.id}" cannot depend on itself`);
      } else if (!ids.has(dep)) {
        errors.push(`Milestone "${m.id}" depends on unknown milestone "${dep}"`);
      }
    }
  }

  const { hasCycle } = topologicalSort(milestones);
  if (hasCycle) errors.push('Dependency graph contains a cycle');

  return { valid: errors.length === 0, errors };
}

/**
 * Check whether a milestone's dependencies are all in APPROVED state.
 */
export function canSubmitMilestone(milestoneId, milestones, statusMap) {
  const milestone = milestones.find(m => m.id === milestoneId);
  if (!milestone) return false;
  for (const dep of (milestone.dependsOn || [])) {
    if (statusMap[dep] !== 'APPROVED') return false;
  }
  return true;
}
