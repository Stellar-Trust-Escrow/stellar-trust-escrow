/**
 * Critical Path & Dependency Graph Utilities
 *
 * Pure functions for DAG analysis used by the EscrowGanttChart.
 * No external dependencies.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export class CyclicDependencyError extends Error {
  constructor(cycle) {
    super(`Cyclic dependency detected: ${cycle.join(' → ')}`);
    this.name = 'CyclicDependencyError';
    this.cycle = cycle;
  }
}

// ── Topological Sort (Kahn's Algorithm) ────────────────────────────────────────

/**
 * Performs topological sort on a DAG. Throws CyclicDependencyError if a cycle exists.
 *
 * @param {Array<{ milestone_id: string; depends_on?: string[] }>} milestones
 * @returns {string[]} Topologically sorted milestone IDs
 */
export function topologicalSort(milestones) {
  const idSet = new Set(milestones.map((m) => m.milestone_id));
  const inDegree = new Map();
  const adj = new Map();

  for (const m of milestones) {
    inDegree.set(m.milestone_id, 0);
    adj.set(m.milestone_id, []);
  }

  for (const m of milestones) {
    for (const dep of m.depends_on ?? []) {
      if (!idSet.has(dep)) continue;
      adj.get(dep).push(m.milestone_id);
      inDegree.set(m.milestone_id, (inDegree.get(m.milestone_id) ?? 0) + 1);
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
    for (const neighbor of adj.get(node) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  if (sorted.length !== milestones.length) {
    // Find the cycle for a helpful error message
    const remaining = milestones
      .map((m) => m.milestone_id)
      .filter((id) => !sorted.includes(id));
    throw new CyclicDependencyError(remaining);
  }

  return sorted;
}

// ── Cycle Detection ────────────────────────────────────────────────────────────

/**
 * Returns true if the dependency graph contains a cycle.
 *
 * @param {Array<{ milestone_id: string; depends_on?: string[] }>} milestones
 * @returns {boolean}
 */
export function hasCycle(milestones) {
  try {
    topologicalSort(milestones);
    return false;
  } catch (e) {
    return e instanceof CyclicDependencyError;
  }
}

// ── Critical Path (Longest Path in DAG) ────────────────────────────────────────

/**
 * Computes the critical path through the milestone dependency graph.
 * The critical path is the longest path (by duration) from any root to any leaf.
 *
 * @param {Array<{ milestone_id: string; start_date: string; end_date: string; depends_on?: string[] }>} milestones
 * @returns {Set<string>} Set of milestone IDs on the critical path
 */
export function computeCriticalPath(milestones) {
  if (milestones.length === 0) return new Set();

  const idSet = new Set(milestones.map((m) => m.milestone_id));
  const byId = new Map(milestones.map((m) => [m.milestone_id, m]));

  // Compute duration for each milestone
  const duration = (m) => {
    const start = new Date(m.start_date).getTime();
    const end = new Date(m.end_date).getTime();
    return Math.max(0, (end - start) / 86400000); // days
  };

  // Build reverse adjacency (who depends on me) and compute earliest start
  const earliestEnd = new Map();
  const predecessor = new Map();

  // Process in topological order
  let sorted;
  try {
    sorted = topologicalSort(milestones);
  } catch {
    return new Set();
  }

  for (const id of sorted) {
    const m = byId.get(id);
    const dur = duration(m);
    const deps = (m.depends_on ?? []).filter((d) => idSet.has(d));

    if (deps.length === 0) {
      earliestEnd.set(id, dur);
      predecessor.set(id, null);
    } else {
      // Find the dependency that finishes latest
      let maxEnd = -1;
      let maxDep = null;
      for (const dep of deps) {
        const depEnd = earliestEnd.get(dep) ?? 0;
        if (depEnd > maxEnd) {
          maxEnd = depEnd;
          maxDep = dep;
        }
      }
      earliestEnd.set(id, maxEnd + dur);
      predecessor.set(id, maxDep);
    }
  }

  // Find the node with maximum earliestEnd (the end of the critical path)
  let maxEnd = -1;
  let endNode = null;
  for (const [id, end] of earliestEnd) {
    if (end > maxEnd) {
      maxEnd = end;
      endNode = id;
    }
  }

  // Trace back from endNode to find the critical path
  const criticalPath = new Set();
  let current = endNode;
  while (current !== null && current !== undefined) {
    criticalPath.add(current);
    current = predecessor.get(current);
  }

  return criticalPath;
}

// ── Timeline Scale (Linear) ────────────────────────────────────────────────────

/**
 * Creates a linear scale mapping a date domain to a pixel range.
 *
 * @param {Date} domainStart
 * @param {Date} domainEnd
 * @param {number} rangeStart
 * @param {number} rangeEnd
 * @returns {(date: Date) => number}
 */
export function createScale(domainStart, domainEnd, rangeStart, rangeEnd) {
  const domainSpan = domainEnd.getTime() - domainStart.getTime();
  const rangeSpan = rangeEnd - rangeStart;
  if (domainSpan === 0) return () => rangeStart;
  return (date) => {
    const t = (date.getTime() - domainStart.getTime()) / domainSpan;
    return rangeStart + t * rangeSpan;
  };
}

/**
 * Creates an inverse scale mapping pixels back to dates.
 *
 * @param {Date} domainStart
 * @param {Date} domainEnd
 * @param {number} rangeStart
 * @param {number} rangeEnd
 * @returns {(x: number) => Date}
 */
export function createInverseScale(domainStart, domainEnd, rangeStart, rangeEnd) {
  const domainSpan = domainEnd.getTime() - domainStart.getTime();
  const rangeSpan = rangeEnd - rangeStart;
  if (rangeSpan === 0) return () => new Date(domainStart);
  return (x) => {
    const t = (x - rangeStart) / rangeSpan;
    return new Date(domainStart.getTime() + t * domainSpan);
  };
}

// ── Zoom Helpers ───────────────────────────────────────────────────────────────

/**
 * Zoom levels and their day-multipliers.
 */
export const ZOOM_LEVELS = ['Day', 'Week', 'Month', 'Quarter'];

export const ZOOM_DAYS = {
  Day: 1,
  Week: 7,
  Month: 30,
  Quarter: 90,
};

/**
 * Generates tick marks for the time axis based on the visible range and zoom level.
 *
 * @param {Date} start
 * @param {Date} end
 * @param {string} zoomLevel — 'Day' | 'Week' | 'Month' | 'Quarter'
 * @returns {Array<{ date: Date; label: string }>}
 */
export function generateTicks(start, end, zoomLevel) {
  const ticks = [];
  const current = new Date(start);

  while (current <= end) {
    let label;
    switch (zoomLevel) {
      case 'Day':
        label = current.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        current.setDate(current.getDate() + 1);
        break;
      case 'Week':
        label = current.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        current.setDate(current.getDate() + 7);
        break;
      case 'Month':
        label = current.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
        current.setMonth(current.getMonth() + 1);
        break;
      case 'Quarter':
        label = `Q${Math.floor(current.getMonth() / 3) + 1} ${current.getFullYear()}`;
        current.setMonth(current.getMonth() + 3);
        break;
      default:
        label = current.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        current.setDate(current.getDate() + 7);
    }
    ticks.push({ date: new Date(current), label });
  }

  return ticks;
}
