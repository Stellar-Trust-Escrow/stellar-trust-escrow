/**
 * Escrow State Machine
 *
 * Single source of truth for valid escrow state transitions.
 * All route handlers and services must go through `transition()` —
 * never mutate escrow.status directly.
 */

// ── States ────────────────────────────────────────────────────────────────────

export const EscrowState = {
  DRAFT: 'draft',
  FUNDED: 'funded',
  IN_PROGRESS: 'in_progress',
  RELEASE_REQUESTED: 'release_requested',
  RELEASED: 'released',
  DISPUTED: 'disputed',
  RESOLVED: 'resolved',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};

// ── Transition map ────────────────────────────────────────────────────────────
//
// Key   = current state
// Value = set of states this escrow is allowed to move into

const TRANSITIONS = {
  [EscrowState.DRAFT]: new Set([
    EscrowState.FUNDED,
    EscrowState.CANCELLED,
  ]),
  [EscrowState.FUNDED]: new Set([
    EscrowState.IN_PROGRESS,
    EscrowState.CANCELLED,
    EscrowState.EXPIRED,
  ]),
  [EscrowState.IN_PROGRESS]: new Set([
    EscrowState.RELEASE_REQUESTED,
    EscrowState.DISPUTED,
    EscrowState.CANCELLED,
    EscrowState.EXPIRED,
  ]),
  [EscrowState.RELEASE_REQUESTED]: new Set([
    EscrowState.RELEASED,
    EscrowState.IN_PROGRESS,   // client rejects release request
    EscrowState.DISPUTED,
  ]),
  [EscrowState.RELEASED]: new Set([]),          // terminal
  [EscrowState.DISPUTED]: new Set([
    EscrowState.RESOLVED,
    EscrowState.CANCELLED,
  ]),
  [EscrowState.RESOLVED]: new Set([]),          // terminal
  [EscrowState.CANCELLED]: new Set([]),         // terminal
  [EscrowState.EXPIRED]: new Set([
    EscrowState.CANCELLED,
  ]),
};

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Validate and apply a state transition.
 *
 * @param {{ status: string, id?: string|number }} escrow - escrow object (or any object with .status)
 * @param {string} toState - target EscrowState value
 * @returns {{ from: string, to: string }} - the applied transition
 * @throws {Error} with statusCode 409 if the transition is not allowed
 */
export function transition(escrow, toState) {
  const fromState = escrow.status;

  if (!(fromState in TRANSITIONS)) {
    const err = new Error(`Unknown escrow state: "${fromState}"`);
    err.statusCode = 409;
    throw err;
  }

  if (!TRANSITIONS[fromState].has(toState)) {
    const allowed = [...TRANSITIONS[fromState]];
    const msg = allowed.length
      ? `Cannot transition escrow from "${fromState}" to "${toState}". Allowed: ${allowed.join(', ')}`
      : `Escrow is in terminal state "${fromState}" and cannot be transitioned`;
    const err = new Error(msg);
    err.statusCode = 409;
    throw err;
  }

  return { from: fromState, to: toState };
}

/**
 * Check whether a transition is valid without throwing.
 *
 * @param {string} fromState
 * @param {string} toState
 * @returns {boolean}
 */
export function canTransition(fromState, toState) {
  return TRANSITIONS[fromState]?.has(toState) ?? false;
}

/**
 * Return the list of states reachable from the given state.
 *
 * @param {string} fromState
 * @returns {string[]}
 */
export function allowedTransitions(fromState) {
  return [...(TRANSITIONS[fromState] ?? new Set())];
}

/**
 * Return true if the state is terminal (no further transitions possible).
 *
 * @param {string} state
 * @returns {boolean}
 */
export function isTerminal(state) {
  return (TRANSITIONS[state]?.size ?? -1) === 0;
}

export default { EscrowState, transition, canTransition, allowedTransitions, isTerminal };
