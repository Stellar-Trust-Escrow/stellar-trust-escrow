'use strict';

/**
 * Milestone Dependency Graph Service
 *
 * Builds and validates directed acyclic graphs (DAGs) of milestone dependencies,
 * computes execution order via topological sort, identifies which milestones are
 * ready to start, and persists the graph to the database.
 *
 * Milestone input shape:
 *   { id: string, dependsOn: string[] }
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// DAG construction
// ---------------------------------------------------------------------------

/**
 * Build an adjacency list representation of a milestone dependency graph.
 * Each node maps to the list of nodes that depend on it (i.e. children in
 * execution order). A separate in-degree map is maintained for cycle detection.
 *
 * @param {Array<{id: string, dependsOn: string[]}>} milestones
 * @returns {{
 *   adjacency: Map<string, string[]>,
 *   inDegree: Map<string, number>,
 *   nodeIds: Set<string>
 * }}
 */
function buildDAG(milestones) {
  if (!Array.isArray(milestones) || milestones.length === 0) {
    throw new TypeError('buildDAG: milestones must be a non-empty array');
  }

  /** @type {Map<string, string[]>} id → list of dependents */
  const adjacency = new Map();
  /** @type {Map<string, number>} id → number of unresolved dependencies */
  const inDegree = new Map();
  /** @type {Set<string>} */
  const nodeIds = new Set();

  // Register every node
  for (const m of milestones) {
    if (!m.id || typeof m.id !== 'string') {
      throw new TypeError('buildDAG: each milestone must have a string id');
    }
    nodeIds.add(m.id);
    if (!adjacency.has(m.id)) adjacency.set(m.id, []);
    if (!inDegree.has(m.id)) inDegree.set(m.id, 0);
  }

  // Wire up edges: dependency → dependent
  for (const m of milestones) {
    const deps = Array.isArray(m.dependsOn) ? m.dependsOn : [];
    for (const depId of deps) {
      if (!nodeIds.has(depId)) {
        throw new Error(
          `buildDAG: milestone "${m.id}" depends on unknown milestone "${depId}"`,
        );
      }
      // depId must complete before m.id, so depId → m.id
      adjacency.get(depId).push(m.id);
      inDegree.set(m.id, (inDegree.get(m.id) || 0) + 1);
    }
  }

  return { adjacency, inDegree, nodeIds };
}

// ---------------------------------------------------------------------------
// Cycle detection
// ---------------------------------------------------------------------------

/**
 * Detect cycles in the dependency graph using iterative DFS with three-colour
 * marking (white / grey / black).
 *
 * @param {Map<string, string[]>} adjacency
 * @param {Set<string>} nodeIds
 * @returns {{ valid: boolean, cycles: string[][] }}
 */
function validateDAG(adjacency, nodeIds) {
  if (!(adjacency instanceof Map)) {
    throw new TypeError('validateDAG: adjacency must be a Map');
  }

  const WHITE = 0; // unvisited
  const GREY = 1;  // in current DFS stack
  const BLACK = 2; // fully processed

  const colour = new Map();
  const parent = new Map();
  for (const id of nodeIds) colour.set(id, WHITE);

  const cycles = [];

  for (const start of nodeIds) {
    if (colour.get(start) !== WHITE) continue;

    // Iterative DFS via explicit stack
    const stack = [{ node: start, edgeIndex: 0 }];
    colour.set(start, GREY);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const neighbours = adjacency.get(frame.node) || [];

      if (frame.edgeIndex < neighbours.length) {
        const neighbour = neighbours[frame.edgeIndex];
        frame.edgeIndex++;

        if (colour.get(neighbour) === GREY) {
          // Back edge found — reconstruct cycle path
          const cycle = [neighbour];
          let cur = frame.node;
          while (cur !== neighbour) {
            cycle.unshift(cur);
            cur = parent.get(cur);
            if (cur === undefined) break; // safety guard
          }
          cycle.unshift(neighbour);
          cycles.push(cycle);
        } else if (colour.get(neighbour) === WHITE) {
          parent.set(neighbour, frame.node);
          colour.set(neighbour, GREY);
          stack.push({ node: neighbour, edgeIndex: 0 });
        }
      } else {
        colour.set(frame.node, BLACK);
        stack.pop();
      }
    }
  }

  return { valid: cycles.length === 0, cycles };
}

// ---------------------------------------------------------------------------
// Topological sort (Kahn's algorithm)
// ---------------------------------------------------------------------------

/**
 * Return milestones in a valid topological execution order using Kahn's BFS
 * algorithm. Throws if the graph contains a cycle.
 *
 * @param {{ adjacency: Map<string, string[]>, inDegree: Map<string, number>, nodeIds: Set<string> }} graph
 * @returns {string[]} Ordered array of milestone IDs.
 */
function topologicalSort(graph) {
  const { adjacency, inDegree, nodeIds } = graph;

  // Work on a copy of inDegree so callers aren't mutated
  const degree = new Map(inDegree);

  // Seed the queue with all zero-degree nodes (stable ordering by id)
  const queue = [...nodeIds].filter((id) => degree.get(id) === 0).sort();
  const sorted = [];

  while (queue.length > 0) {
    queue.sort(); // keep deterministic order among nodes at same depth
    const node = queue.shift();
    sorted.push(node);

    for (const neighbour of (adjacency.get(node) || [])) {
      const newDegree = degree.get(neighbour) - 1;
      degree.set(neighbour, newDegree);
      if (newDegree === 0) queue.push(neighbour);
    }
  }

  if (sorted.length !== nodeIds.size) {
    throw new Error('topologicalSort: graph contains a cycle — sort is impossible');
  }

  return sorted;
}

// ---------------------------------------------------------------------------
// Unlocked milestone detection
// ---------------------------------------------------------------------------

/**
 * Given a set of already-completed milestone IDs, return the IDs of milestones
 * whose every dependency has been satisfied and which are not yet complete.
 *
 * @param {Array<{id: string, dependsOn: string[]}>} milestones - Original milestone list.
 * @param {string[]} completedIds - IDs of milestones that have been completed.
 * @returns {string[]} IDs of milestones that are now unblocked.
 */
function getUnlockedMilestones(milestones, completedIds) {
  if (!Array.isArray(milestones)) {
    throw new TypeError('getUnlockedMilestones: milestones must be an array');
  }
  if (!Array.isArray(completedIds)) {
    throw new TypeError('getUnlockedMilestones: completedIds must be an array');
  }

  const completedSet = new Set(completedIds);

  return milestones
    .filter((m) => {
      if (completedSet.has(m.id)) return false; // already done
      const deps = Array.isArray(m.dependsOn) ? m.dependsOn : [];
      return deps.every((depId) => completedSet.has(depId));
    })
    .map((m) => m.id);
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Persist the milestone dependency graph for an escrow to the database.
 * Replaces any previously stored graph for the same escrow.
 *
 * @param {string} escrowId
 * @param {Array<{id: string, dependsOn: string[]}>} milestones
 * @returns {Promise<object>} The upserted MilestoneGraph record.
 */
async function saveMilestoneGraph(escrowId, milestones) {
  if (!escrowId || typeof escrowId !== 'string') {
    throw new TypeError('saveMilestoneGraph: escrowId must be a non-empty string');
  }
  if (!Array.isArray(milestones) || milestones.length === 0) {
    throw new TypeError('saveMilestoneGraph: milestones must be a non-empty array');
  }

  // Validate before persisting
  const graph = buildDAG(milestones);
  const { valid, cycles } = validateDAG(graph.adjacency, graph.nodeIds);
  if (!valid) {
    throw new Error(
      `saveMilestoneGraph: cannot save — graph contains ${cycles.length} cycle(s): ` +
        cycles.map((c) => c.join(' → ')).join('; '),
    );
  }

  const serialised = JSON.stringify(
    milestones.map((m) => ({ id: m.id, dependsOn: m.dependsOn || [] })),
  );

  const record = await prisma.milestoneGraph.upsert({
    where: { escrowId },
    create: { escrowId, graph: serialised, updatedAt: new Date() },
    update: { graph: serialised, updatedAt: new Date() },
  });

  console.log(
    `[milestoneGraphService] Saved graph for escrow ${escrowId} — ${milestones.length} nodes`,
  );
  return record;
}

module.exports = {
  buildDAG,
  validateDAG,
  topologicalSort,
  getUnlockedMilestones,
  saveMilestoneGraph,
};
