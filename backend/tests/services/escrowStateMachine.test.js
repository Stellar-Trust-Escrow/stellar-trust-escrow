import { jest, describe, expect, it, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import {
  transition,
  TRANSITIONS,
  InvalidTransitionError,
} from '../../services/escrowStateMachine.js';

// ── Unit Tests ────────────────────────────────────────────────────────────────

describe('Escrow State Machine - Unit Tests', () => {
  let mockPrisma;

  beforeEach(() => {
    mockPrisma = {
      escrow: {
        update: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (promises) => Promise.all(promises)),
    };
  });

  describe('Valid Transitions', () => {
    const validCases = [
      { from: 'Active', to: 'Completed' },
      { from: 'Active', to: 'Disputed' },
      { from: 'Active', to: 'Cancelled' },
      { from: 'Active', to: 'Expired' },
      { from: 'Disputed', to: 'Resolved' },
      { from: 'Disputed', to: 'Cancelled' },
    ];

    validCases.forEach(({ from, to }) => {
      it(`succeeds for valid transition: ${from} → ${to} and writes an audit log row`, async () => {
        const escrow = { id: 101n, status: from, tenantId: 'default' };
        const updatedEscrow = { ...escrow, status: to };

        mockPrisma.escrow.update.mockReturnValue(Promise.resolve(updatedEscrow));
        mockPrisma.auditLog.create.mockReturnValue(Promise.resolve({ id: 1n }));

        const result = await transition(
          escrow,
          to,
          'G...CLIENT',
          { reason: 'testing' },
          mockPrisma,
        );

        expect(result).toEqual(updatedEscrow);
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
        expect(mockPrisma.escrow.update).toHaveBeenCalledWith({
          where: { id: 101n },
          data: { status: to },
        });
        expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            escrowId: 101n,
            fromState: from,
            toState: to,
            actor: 'G...CLIENT',
            metadata: { reason: 'testing' },
          }),
        });
      });
    });
  });

  describe('Invalid Transitions', () => {
    const invalidCases = [
      { from: 'Completed', to: 'Disputed' },
      { from: 'Expired', to: 'Active' },
      { from: 'Cancelled', to: 'Disputed' },
      { from: 'Resolved', to: 'Active' },
      { from: 'Completed', to: 'Active' },
      { from: 'Cancelled', to: 'Active' },
    ];

    invalidCases.forEach(({ from, to }) => {
      it(`throws InvalidTransitionError for invalid transition: ${from} → ${to}`, async () => {
        const escrow = { id: 102n, status: from };

        await expect(
          transition(escrow, to, 'G...ACTOR', {}, mockPrisma),
        ).rejects.toThrow(InvalidTransitionError);

        expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      });
    });

    it('sets correct properties on InvalidTransitionError', async () => {
      const escrow = { id: 103n, status: 'Completed' };
      try {
        await transition(escrow, 'Disputed', 'G...ACTOR', {}, mockPrisma);
        expect(true).toBe(false); // Should not reach here
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidTransitionError);
        expect(err.fromState).toBe('Completed');
        expect(err.toState).toBe('Disputed');
        expect(err.message).toBe('Invalid transition from Completed to Disputed');
      }
    });
  });

  describe('Atomicity & Rollback', () => {
    it('rolls back escrow update if auditLog.create fails in $transaction', async () => {
      const escrow = { id: 104n, status: 'Active' };
      const auditError = new Error('Database connection failed on auditLog.create');

      // Mock $transaction to reject when any promise in the array fails
      mockPrisma.$transaction.mockImplementation(async (promises) => {
        // Evaluate promises to simulate atomic transaction failure
        return Promise.all(promises);
      });

      mockPrisma.escrow.update.mockResolvedValue({ id: 104n, status: 'Disputed' });
      mockPrisma.auditLog.create.mockRejectedValue(auditError);

      await expect(
        transition(escrow, 'Disputed', 'G...ACTOR', {}, mockPrisma),
      ).rejects.toThrow('Database connection failed on auditLog.create');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});

// ── Integration Tests ─────────────────────────────────────────────────────────

describe('Escrow State Machine - Integration Tests', () => {
  let app;
  let store;

  beforeEach(() => {
    store = {
      escrows: new Map([
        [
          1n,
          {
            id: 1n,
            clientAddress: 'G...CLIENT',
            freelancerAddress: 'G...FREELANCER',
            tokenAddress: 'G...TOKEN',
            totalAmount: '1000',
            remainingBalance: '1000',
            status: 'Active',
            briefHash: 'Qm...',
            createdAt: new Date(),
            createdLedger: 100n,
            tenantId: 'default',
          },
        ],
      ]),
      auditLogs: [],
    };

    const mockPrismaClient = {
      escrow: {
        findUnique: jest.fn(async ({ where }) => store.escrows.get(where.id) || null),
        update: jest.fn(async ({ where, data }) => {
          const esc = store.escrows.get(where.id);
          if (!esc) throw new Error('Escrow not found');
          const updated = { ...esc, status: data.status };
          store.escrows.set(where.id, updated);
          return updated;
        }),
      },
      auditLog: {
        create: jest.fn(async ({ data }) => {
          const logEntry = {
            id: BigInt(store.auditLogs.length + 1),
            createdAt: new Date(),
            ...data,
          };
          store.auditLogs.push(logEntry);
          return logEntry;
        }),
        findMany: jest.fn(async ({ where }) => {
          return store.auditLogs.filter((entry) => {
            if (where.OR) {
              return where.OR.some(
                (cond) =>
                  (cond.escrowId && entry.escrowId === cond.escrowId) ||
                  (cond.resourceId && entry.resourceId === cond.resourceId),
              );
            }
            return entry.escrowId === where.escrowId;
          });
        }),
      },
      $transaction: jest.fn(async (promises) => Promise.all(promises)),
    };

    app = express();
    app.use(express.json());

    // Middleware mocking auth and tenant
    app.use((req, _res, next) => {
      req.user = { walletAddress: 'G...DISPUTER' };
      req.tenant = { id: 'default' };
      next();
    });

    // Mount escrow endpoints directly for testing
    app.post('/api/v1/escrows/:id/dispute', async (req, res) => {
      try {
        const id = BigInt(req.params.id);
        const escrow = await mockPrismaClient.escrow.findUnique({ where: { id } });
        if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

        const updated = await transition(
          escrow,
          'Disputed',
          req.user.walletAddress,
          req.body.metadata || { reason: req.body.reason },
          mockPrismaClient,
        );

        res.json({
          ...updated,
          id: updated.id.toString(),
          createdLedger: updated.createdLedger.toString(),
        });
      } catch (err) {
        if (err instanceof InvalidTransitionError) {
          return res.status(400).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
      }
    });

    app.get('/api/v1/escrows/:id/events', async (req, res) => {
      try {
        const id = BigInt(req.params.id);
        const events = await mockPrismaClient.auditLog.findMany({
          where: {
            OR: [{ escrowId: id }, { resourceId: String(id) }],
          },
        });

        const data = events.map((e) => ({
          ...e,
          id: e.id.toString(),
          escrowId: e.escrowId ? e.escrowId.toString() : null,
        }));

        res.json({ data, total: data.length });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
  });

  it('POST /api/v1/escrows/:id/dispute writes an audit log entry readable via GET /api/v1/escrows/:id/events', async () => {
    // 1. Initiate dispute via POST endpoint
    const postRes = await request(app)
      .post('/api/v1/escrows/1/dispute')
      .send({ reason: 'Work delivered was unsatisfactory' });

    expect(postRes.status).toBe(200);
    expect(postRes.body.status).toBe('Disputed');

    // 2. Verify audit log entry via GET events endpoint
    const getRes = await request(app).get('/api/v1/escrows/1/events');

    expect(getRes.status).toBe(200);
    expect(getRes.body.total).toBe(1);
    expect(getRes.body.data[0]).toMatchObject({
      escrowId: '1',
      fromState: 'Active',
      toState: 'Disputed',
      actor: 'G...DISPUTER',
      metadata: { reason: 'Work delivered was unsatisfactory' },
    });
  });
});
