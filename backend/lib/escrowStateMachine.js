/**
 * Escrow State Machine — deterministic, side-effect-free transitions.
 *
 * The state machine is intentionally a pure module: it never touches the
 * database, the network, or the clock. Every transition is a pure function of
 * `(currentStatus, nextStatus)`, which makes it trivially testable and lets the
 * CQRS write model (escrowService) delegate all legality checks to it.
 *
 * ## States
 *   draft, funded, in_progress, release_requested,
 *   disputed, resolved, released, cancelled, expired
 *
 * ## Invariants enforced here
 *   - A move is legal only if it appears in TRANSITIONS[from].
 *   - Terminal states (resolved / released / cancelled / expired) have no
 *     outgoing edges, so any attempt to leave them is rejected.
 *   - validateHistory rejects gaps (an illegal step), temporal inversions
 *     (a later entry timestamped before an earlier one), and unknown states.
 *
 * Note: the on-chain / DB status vocabulary (Active, Completed, Disputed, …)
 * is mapped to and from these states by escrowService; this module only ever
 * deals with the canonical lifecycle vocabulary above.
 *
 * @module lib/escrowStateMachine
 */

/** Allowed forward transitions keyed by source state. */
export const TRANSITIONS = Object.freeze({
  draft: ['funded'],
  funded: ['in_progress', 'cancelled', 'expired'],
  in_progress: ['release_requested', 'disputed', 'cancelled', 'expired'],
  release_requested: ['released', 'disputed'],
  disputed: ['resolved', 'cancelled'],
  // resolved, released, cancelled, expired are terminal (no outgoing edges).
});

/** Terminal states — once reached, the escrow is finished. */
export const TERMINAL_STATES = Object.freeze(
  new Set(['resolved', 'released', 'cancelled', 'expired']),
);

/** Every state the machine understands (source states ∪ terminal states). */
const ALL_STATES = new Set([...Object.keys(TRANSITIONS), ...TERMINAL_STATES]);

function isKnownState(status) {
  return ALL_STATES.has(status);
}

/**
 * Returns the set of states reachable from `status`.
 * For a terminal or unknown state this is an empty array.
 *
 * @param {string} status
 * @returns {string[]}
 */
export function allowedTransitions(status) {
  return [...(TRANSITIONS[status] || [])];
}

/**
 * Whether `status` is a terminal state.
 * @param {string} status
 * @returns {boolean}
 */
export function isTerminal(status) {
  return TERMINAL_STATES.has(status);
}

/**
 * Apply a transition to `escrow`, mutating `escrow.status` in place.
 *
 * @param {{ status: string }} escrow - object carrying the current status
 * @param {string} nextStatus - desired next status
 * @returns {object} the same (mutated) escrow
 * @throws {{ code: 'INVALID_TRANSITION', status: 409, from: string, to: string }}
 *   when the move is not in TRANSITIONS.
 */
export function transition(escrow, nextStatus) {
  const from = escrow.status;
  const allowed = TRANSITIONS[from] || [];
  if (!allowed.includes(nextStatus)) {
    const err = new Error(`[INVALID_TRANSITION] Illegal transition: ${from} → ${nextStatus}`);
    err.code = 'INVALID_TRANSITION';
    err.status = 409;
    err.from = from;
    err.to = nextStatus;
    throw err;
  }
  escrow.status = nextStatus;
  return escrow;
}

/**
 * Validate a chronological status history.
 *
 * @param {Array<{ status: string, at: Date | number }>} history
 * @returns {true} when the history is internally consistent
 * @throws when the history is malformed or contains a gap, illegal step,
 *   temporal inversion, or unknown state.
 */
export function validateHistory(history) {
  if (!Array.isArray(history)) {
    const err = new Error('[INVALID_HISTORY] history must be an array');
    err.code = 'INVALID_HISTORY';
    err.status = 400;
    throw err;
  }

  if (history.length === 0) {
    return true;
  }

  if (history.length === 1) {
    const only = history[0];
    if (!isKnownState(only.status)) {
      const err = new Error(`[UNKNOWN_STATE] Unknown state: ${only.status}`);
      err.code = 'UNKNOWN_STATE';
      err.status = 400;
      err.state = only.status;
      throw err;
    }
    return true;
  }

  for (let i = 0; i < history.length - 1; i++) {
    const prev = history[i];
    const next = history[i + 1];

    if (!isKnownState(prev.status) || !isKnownState(next.status)) {
      const err = new Error(`[UNKNOWN_STATE] Unknown state at index ${i}`);
      err.code = 'UNKNOWN_STATE';
      err.status = 400;
      err.index = i;
      throw err;
    }

    const prevTime = prev.at instanceof Date ? prev.at.getTime() : new Date(prev.at).getTime();
    const nextTime = next.at instanceof Date ? next.at.getTime() : new Date(next.at).getTime();
    if (nextTime < prevTime) {
      const err = new Error(`[TEMPORAL_INVERSION] Temporal inversion at index ${i}`);
      err.code = 'TEMPORAL_INVERSION';
      err.status = 409;
      err.index = i;
      err.from = prev.status;
      err.to = next.status;
      throw err;
    }

    const allowed = TRANSITIONS[prev.status] || [];
    if (!allowed.includes(next.status)) {
      const err = new Error(
        `[INVALID_HISTORY_STEP] Illegal step ${prev.status} → ${next.status} at index ${i}`,
      );
      err.code = 'INVALID_HISTORY_STEP';
      err.status = 409;
      err.index = i;
      err.from = prev.status;
      err.to = next.status;
      throw err;
    }
  }

  return true;
}

export default {
  TRANSITIONS,
  TERMINAL_STATES,
  allowedTransitions,
  isTerminal,
  transition,
  validateHistory,
};
