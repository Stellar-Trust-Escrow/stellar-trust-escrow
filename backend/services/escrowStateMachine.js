/**
 * Escrow State Machine Service
 *
 * Centralises business logic for escrow state transitions and ensures an
 * immutable audit log entry is created atomically in PostgreSQL on every state change.
 *
 * @module services/escrowStateMachine
 */
import prismaClient from '../config/prismaClient.js';


export class InvalidTransitionError extends Error {
  constructor(fromState, toState) {
    super(`Invalid transition from ${fromState} to ${toState}`);
    this.name = 'InvalidTransitionError';
    this.fromState = fromState;
    this.toState = toState;
  }
}

/**
 * Escrow transition table (Map of Maps).
 * Also accessible via property lookups `TRANSITIONS[fromState][toState]`.
 */
export const TRANSITIONS = new Map([
  [
    'Active',
    new Map([
      ['Completed', true],
      ['Disputed', true],
      ['Cancelled', true],
      ['Expired', true],
    ]),
  ],
  [
    'Disputed',
    new Map([
      ['Resolved', true],
      ['Cancelled', true],
    ]),
  ],
  ['Expired', new Map()],
  ['Completed', new Map()],
  ['Resolved', new Map()],
  ['Cancelled', new Map()],
]);

// Allow direct property access TRANSITIONS[fromState][toState]
TRANSITIONS.Active = { Completed: true, Disputed: true, Cancelled: true, Expired: true };
TRANSITIONS.Disputed = { Resolved: true, Cancelled: true };
TRANSITIONS.Expired = {};
TRANSITIONS.Completed = {};
TRANSITIONS.Resolved = {};
TRANSITIONS.Cancelled = {};

/**
 * Execute an escrow state transition.
 *
 * @param {object} escrow - Escrow record (must have id and status)
 * @param {string} newState - Target status to transition to
 * @param {string} actor - Address or identity initiating transition
 * @param {object} [metadata={}] - Optional metadata JSON object
 * @param {object} [prisma=prismaClient] - Optional Prisma client (useful for mocking / transactions)
 * @returns {Promise<object>} Updated escrow object
 */
export async function transition(escrow, newState, actor, metadata = {}, prisma = prismaClient) {
  const fromState = escrow?.status;
  const valid =
    TRANSITIONS[fromState]?.[newState] ||
    (TRANSITIONS.get?.(fromState) && TRANSITIONS.get(fromState).get?.(newState));

  if (!valid) {
    throw new InvalidTransitionError(fromState, newState);
  }

  const escrowId = typeof escrow.id === 'bigint' ? escrow.id : BigInt(escrow.id);
  const timestamp = new Date();
  const tenantId = escrow.tenantId || 'default';

  const [updatedEscrow] = await prisma.$transaction([
    prisma.escrow.update({
      where: { id: escrowId },
      data: { status: newState },
    }),
    prisma.auditLog.create({
      data: {
        tenantId,
        category: 'ESCROW',
        action: 'STATE_TRANSITION',
        actor: actor || 'system',
        resourceId: String(escrowId),
        escrowId,
        fromState,
        toState: newState,
        metadata: metadata || {},
        timestamp,
        createdAt: timestamp,
      },
    }),
  ]);

  return updatedEscrow;
}

export default {
  InvalidTransitionError,
  TRANSITIONS,
  transition,
};
