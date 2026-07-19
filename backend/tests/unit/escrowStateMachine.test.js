/**
 * Tests for lib/escrowStateMachine.js
 *
 * Goal: 100% branch coverage of the pure state machine. We exercise every row
 * of TRANSITIONS, every terminal state, representative invalid pairs, and every
 * branch of validateHistory (gap, temporal inversion, unknown state, empty /
 * single-element histories).
 */

import {
  TRANSITIONS,
  TERMINAL_STATES,
  allowedTransitions,
  isTerminal,
  transition,
  validateHistory,
} from '../../lib/escrowStateMachine.js';

describe('escrowStateMachine — constants', () => {
  it('exposes the full transition table', () => {
    expect(TRANSITIONS.draft).toEqual(['funded']);
    expect(TRANSITIONS.funded).toEqual(['in_progress', 'cancelled', 'expired']);
    expect(TRANSITIONS.in_progress).toEqual([
      'release_requested',
      'disputed',
      'cancelled',
      'expired',
    ]);
    expect(TRANSITIONS.release_requested).toEqual(['released', 'disputed']);
    expect(TRANSITIONS.disputed).toEqual(['resolved', 'cancelled']);
  });

  it('exposes the four terminal states', () => {
    expect([...TERMINAL_STATES]).toEqual(
      expect.arrayContaining(['resolved', 'released', 'cancelled', 'expired']),
    );
  });
});

describe('allowedTransitions', () => {
  it('returns a copy of the outgoing edges for a non-terminal state', () => {
    const result = allowedTransitions('funded');
    expect(result).toEqual(['in_progress', 'cancelled', 'expired']);
    // defensive copy — mutating the result must not mutate the table
    result.push('draft');
    expect(TRANSITIONS.funded).toEqual(['in_progress', 'cancelled', 'expired']);
  });

  it('returns an empty array for a terminal state', () => {
    expect(allowedTransitions('resolved')).toEqual([]);
    expect(allowedTransitions('released')).toEqual([]);
    expect(allowedTransitions('cancelled')).toEqual([]);
    expect(allowedTransitions('expired')).toEqual([]);
  });

  it('returns an empty array for an unknown state', () => {
    expect(allowedTransitions('nonexistent')).toEqual([]);
  });
});

describe('isTerminal', () => {
  it('is true for every terminal state', () => {
    for (const state of TERMINAL_STATES) {
      expect(isTerminal(state)).toBe(true);
    }
  });

  it('is false for non-terminal states', () => {
    expect(isTerminal('draft')).toBe(false);
    expect(isTerminal('funded')).toBe(false);
    expect(isTerminal('in_progress')).toBe(false);
    expect(isTerminal('release_requested')).toBe(false);
    expect(isTerminal('disputed')).toBe(false);
  });
});

describe('transition — legal moves (every row of TRANSITIONS)', () => {
  for (const [from, targets] of Object.entries(TRANSITIONS)) {
    for (const to of targets) {
      it(`allows ${from} → ${to}`, () => {
        const escrow = { status: from };
        const result = transition(escrow, to);
        expect(result).toBe(escrow);
        expect(escrow.status).toBe(to);
      });
    }
  }
});

describe('transition — illegal moves', () => {
  const illegalPairs = [
    ['draft', 'in_progress'],
    ['draft', 'released'],
    ['funded', 'released'],
    ['funded', 'disputed'],
    ['in_progress', 'funded'],
    ['in_progress', 'resolved'],
    ['release_requested', 'funded'],
    ['release_requested', 'cancelled'],
    ['disputed', 'funded'],
    ['disputed', 'in_progress'],
  ];

  for (const [from, to] of illegalPairs) {
    it(`rejects ${from} → ${to}`, () => {
      const escrow = { status: from };
      expect(() => transition(escrow, to)).toThrow();
      try {
        transition(escrow, to);
      } catch (err) {
        expect(err.code).toBe('INVALID_TRANSITION');
        expect(err.status).toBe(409);
        expect(err.from).toBe(from);
        expect(err.to).toBe(to);
      }
      // status must be unchanged on rejection
      expect(escrow.status).toBe(from);
    });
  }

  it('rejects a move out of a terminal state', () => {
    for (const terminal of TERMINAL_STATES) {
      const escrow = { status: terminal };
      expect(() => transition(escrow, 'funded')).toThrow(/INVALID_TRANSITION/);
      expect(escrow.status).toBe(terminal);
    }
  });

  it('rejects an unknown source state', () => {
    const escrow = { status: 'ghost' };
    expect(() => transition(escrow, 'funded')).toThrow(/INVALID_TRANSITION/);
  });

  it('rejects an unknown target state', () => {
    const escrow = { status: 'draft' };
    expect(() => transition(escrow, 'ghost')).toThrow(/INVALID_TRANSITION/);
  });

  it('rejects when the escrow has no status', () => {
    const escrow = {};
    expect(() => transition(escrow, 'funded')).toThrow(/INVALID_TRANSITION/);
  });
});

describe('validateHistory', () => {
  it('throws when the argument is not an array', () => {
    expect(() => validateHistory(null)).toThrow(/history must be an array/);
    expect(() => validateHistory({})).toThrow(/history must be an array/);
    try {
      validateHistory('nope');
    } catch (err) {
      expect(err.code).toBe('INVALID_HISTORY');
      expect(err.status).toBe(400);
    }
  });

  it('accepts an empty history', () => {
    expect(validateHistory([])).toBe(true);
  });

  it('accepts a single known state', () => {
    expect(validateHistory([{ status: 'draft', at: new Date(1000) }])).toBe(true);
  });

  it('rejects a single unknown state', () => {
    expect(() => validateHistory([{ status: 'ghost', at: new Date(1000) }])).toThrow(
      /Unknown state/,
    );
    try {
      validateHistory([{ status: 'ghost', at: new Date(1000) }]);
    } catch (err) {
      expect(err.code).toBe('UNKNOWN_STATE');
      expect(err.status).toBe(400);
      expect(err.state).toBe('ghost');
    }
  });

  it('accepts a valid 3-step history with increasing timestamps', () => {
    const history = [
      { status: 'draft', at: new Date(1000) },
      { status: 'funded', at: new Date(2000) },
      { status: 'in_progress', at: new Date(3000) },
    ];
    expect(validateHistory(history)).toBe(true);
  });

  it('accepts a full valid lifecycle ending in a terminal state', () => {
    const history = [
      { status: 'draft', at: new Date(1000) },
      { status: 'funded', at: new Date(2000) },
      { status: 'in_progress', at: new Date(3000) },
      { status: 'release_requested', at: new Date(4000) },
      { status: 'released', at: new Date(5000) },
    ];
    expect(validateHistory(history)).toBe(true);
  });

  it('detects a gap / illegal step between consecutive entries', () => {
    const history = [
      { status: 'draft', at: new Date(1000) },
      { status: 'disputed', at: new Date(2000) }, // draft → disputed is illegal
    ];
    expect(() => validateHistory(history)).toThrow();
    try {
      validateHistory(history);
    } catch (err) {
      expect(err.code).toBe('INVALID_HISTORY_STEP');
      expect(err.status).toBe(409);
      expect(err.index).toBe(0);
      expect(err.from).toBe('draft');
      expect(err.to).toBe('disputed');
    }
  });

  it('detects a history that skips states to reach disputed', () => {
    // funded → disputed is not allowed; disputed must come from
    // in_progress or release_requested.
    const history = [
      { status: 'draft', at: new Date(1000) },
      { status: 'funded', at: new Date(2000) },
      { status: 'disputed', at: new Date(3000) },
    ];
    expect(() => validateHistory(history)).toThrow(/INVALID_HISTORY_STEP/);
  });

  it('detects a temporal inversion (later entry timestamped earlier)', () => {
    const history = [
      { status: 'draft', at: new Date(3000) },
      { status: 'funded', at: new Date(1000) }, // inverted
    ];
    expect(() => validateHistory(history)).toThrow();
    try {
      validateHistory(history);
    } catch (err) {
      expect(err.code).toBe('TEMPORAL_INVERSION');
      expect(err.status).toBe(409);
      expect(err.index).toBe(0);
      expect(err.from).toBe('draft');
      expect(err.to).toBe('funded');
    }
  });

  it('detects an unknown state in the middle of an otherwise valid history', () => {
    const history = [
      { status: 'draft', at: new Date(1000) },
      { status: 'ghost', at: new Date(2000) },
      { status: 'in_progress', at: new Date(3000) },
    ];
    expect(() => validateHistory(history)).toThrow();
    try {
      validateHistory(history);
    } catch (err) {
      expect(err.code).toBe('UNKNOWN_STATE');
      expect(err.status).toBe(400);
      expect(err.index).toBe(0);
    }
  });

  it('rejects an unknown target state even when timestamps are ordered', () => {
    const history = [
      { status: 'draft', at: new Date(1000) },
      { status: 'funded', at: new Date(2000) },
      { status: 'ghost', at: new Date(3000) },
    ];
    expect(() => validateHistory(history)).toThrow(/UNKNOWN_STATE/);
  });

  it('accepts numeric timestamps (not just Date objects)', () => {
    const history = [
      { status: 'draft', at: 1000 },
      { status: 'funded', at: 2000 },
    ];
    expect(validateHistory(history)).toBe(true);
  });

  it('rejects a history that uses a terminal state as a non-final step', () => {
    // 'released' is a known state but has no outgoing transitions, so any
    // continuation is an illegal step (exercises the `|| []` fallback).
    const history = [
      { status: 'released', at: new Date(1000) },
      { status: 'cancelled', at: new Date(2000) },
    ];
    expect(() => validateHistory(history)).toThrow(/INVALID_HISTORY_STEP/);
  });
});
