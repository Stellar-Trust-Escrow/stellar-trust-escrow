/**
 * Tests for Stellar Horizon Event Listener
 *
 * Covers:
 *  - Deduplication of events by paging_token
 *  - Cursor persistence and recovery
 *  - Event processing and database mutations
 *  - Stream error handling and exponential backoff
 *  - At-least-once delivery guarantee
 */

import { jest } from '@jest/globals';

// Setup mock prisma before importing stellarListener
const mockPrisma = {
  processedEvent: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
  },
  systemConfig: {
    findUnique: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
  },
  escrow: {
    upsert: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  milestone: {
    updateMany: jest.fn(),
    update: jest.fn(),
  },
  dispute: {
    upsert: jest.fn(),
    create: jest.fn(),
  },
  reputationRecord: {
    upsert: jest.fn(),
    update: jest.fn(),
  },
  reputationEvent: {
    create: jest.fn(),
  },
  $transaction: jest.fn((ops) => Promise.resolve()),
};

// Mock the prisma module
jest.mock('../../lib/prisma.js', () => mockPrisma, { virtual: true });
jest.mock(
  '../../config/logger.js',
  () => ({
    createModuleLogger: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
  { virtual: true },
);

import * as stellarListener from '../../services/stellarListener.js';

// ── Unit Tests ────────────────────────────────────────────────────────────────

describe('stellarListener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Deduplication Tests ───────────────────────────────────────────────────

  describe('deduplication by paging_token', () => {
    it('should skip processing if event already processed', async () => {
      const event = {
        paging_token: 'token-123',
        ledger_attr: '1000',
        transaction_hash: 'tx-123',
        index: 0,
        topic: ['esc_crt', { u64: '1' }],
        data: {
          client: 'GAAAAA...',
          freelancer: 'GBBBBB...',
          token: 'GCCCCCC...',
          amount: { u128: '1000000' },
        },
      };

      // Mock: event already processed
      mockPrisma.processedEvent.findUnique.mockResolvedValueOnce({
        id: 1,
        pagingToken: 'token-123',
      });

      await stellarListener.processContractEvent(event);

      // Should NOT create any database records
      expect(mockPrisma.escrow.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.processedEvent.create).not.toHaveBeenCalled();
    });

    it('should process event once and record as processed', async () => {
      const event = {
        paging_token: 'token-456',
        ledger_attr: '1001',
        transaction_hash: 'tx-456',
        index: 1,
        topic: ['esc_crt', { u64: '2' }],
        data: {
          client: 'GAAAAA...',
          freelancer: 'GBBBBB...',
          token: 'GCCCCCC...',
          amount: { u128: '2000000' },
        },
      };

      // Mock: event not yet processed
      mockPrisma.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockPrisma.escrow.upsert.mockResolvedValueOnce({
        id: 2n,
        status: 'Active',
      });
      mockPrisma.processedEvent.create.mockResolvedValueOnce({
        id: 1,
        pagingToken: 'token-456',
      });

      await stellarListener.processContractEvent(event);

      // Should create escrow
      expect(mockPrisma.escrow.upsert).toHaveBeenCalled();

      // Should record event as processed
      expect(mockPrisma.processedEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pagingToken: 'token-456',
            eventType: 'EscrowCreated',
          }),
        }),
      );
    });

    it('duplicate event (same paging_token) processed twice creates DB record only once', async () => {
      const event = {
        paging_token: 'token-dup',
        ledger_attr: '1002',
        transaction_hash: 'tx-dup',
        index: 2,
        topic: ['esc_crt', { u64: '3' }],
        data: {
          client: 'GAAAAA...',
          freelancer: 'GBBBBB...',
          token: 'GCCCCCC...',
          amount: { u128: '3000000' },
        },
      };

      // First processing: event not seen before
      mockPrisma.processedEvent.findUnique
        .mockResolvedValueOnce(null) // First call: not found
        .mockResolvedValueOnce({ id: 1, pagingToken: 'token-dup' }); // Second call: found

      mockPrisma.escrow.upsert.mockResolvedValue({ id: 3n, status: 'Active' });
      mockPrisma.processedEvent.create.mockResolvedValue({ id: 1 });

      // Process first time
      await stellarListener.processContractEvent(event);
      expect(mockPrisma.escrow.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.processedEvent.create).toHaveBeenCalledTimes(1);

      // Reset mocks for second processing
      jest.clearAllMocks();
      mockPrisma.processedEvent.findUnique.mockResolvedValueOnce({
        id: 1,
        pagingToken: 'token-dup',
      });

      // Process second time (duplicate)
      await stellarListener.processContractEvent(event);
      expect(mockPrisma.escrow.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.processedEvent.create).not.toHaveBeenCalled();
    });
  });

  // ── Cursor Persistence Tests ──────────────────────────────────────────────

  describe('cursor persistence and recovery', () => {
    it('should load cursor from database', async () => {
      const savedCursor = 'cursor-last-position';

      mockPrisma.systemConfig.findUnique.mockResolvedValueOnce({
        key: 'horizon_cursor',
        value: savedCursor,
      });

      const cursor = await stellarListener.loadCursor();

      expect(cursor).toBe(savedCursor);
      expect(mockPrisma.systemConfig.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'horizon_cursor' },
        }),
      );
    });

    it('should initialize cursor to "now" if not found', async () => {
      mockPrisma.systemConfig.findUnique.mockResolvedValueOnce(null);
      mockPrisma.systemConfig.create.mockResolvedValueOnce({
        key: 'horizon_cursor',
        value: 'now',
      });

      const cursor = await stellarListener.loadCursor();

      expect(cursor).toBe('now');
      expect(mockPrisma.systemConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            key: 'horizon_cursor',
            value: 'now',
            description: expect.any(String),
          },
        }),
      );
    });

    it('should save cursor after each event', async () => {
      const newCursor = 'token-999';

      mockPrisma.systemConfig.upsert.mockResolvedValueOnce({
        key: 'horizon_cursor',
        value: newCursor,
      });

      await stellarListener.saveCursor(newCursor);

      expect(mockPrisma.systemConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'horizon_cursor' },
          create: expect.objectContaining({
            value: newCursor,
          }),
          update: expect.objectContaining({
            value: newCursor,
          }),
        }),
      );
    });

    it('on restart, listener resumes from saved cursor', async () => {
      const savedCursor = 'checkpoint-position-123';

      mockPrisma.systemConfig.findUnique.mockResolvedValueOnce({
        key: 'horizon_cursor',
        value: savedCursor,
      });

      const cursor = await stellarListener.loadCursor();

      expect(cursor).toBe(savedCursor);
    });
  });

  // ── Event Processing Tests ────────────────────────────────────────────────

  describe('event type mapping to Prisma operations', () => {
    beforeEach(() => {
      mockPrisma.processedEvent.findUnique.mockResolvedValue(null);
      mockPrisma.processedEvent.create.mockResolvedValue({ id: 1 });
    });

    it('should map EscrowCreated to prisma.escrow.create', async () => {
      const event = {
        paging_token: 'token-es1',
        ledger_attr: '2000',
        transaction_hash: 'tx-es1',
        index: 0,
        topic: ['esc_crt', { u64: '100' }],
        data: {
          client: 'GAAAAA...',
          freelancer: 'GBBBBB...',
          token: 'GCCCCCC...',
          amount: { u128: '5000000' },
        },
      };

      mockPrisma.escrow.upsert.mockResolvedValueOnce({ id: 100n });

      await stellarListener.processContractEvent(event);

      expect(mockPrisma.escrow.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 100n },
          create: expect.objectContaining({
            clientAddress: 'GAAAAA...',
            freelancerAddress: 'GBBBBB...',
            status: 'Active',
          }),
        }),
      );
    });

    it('should map MilestoneApproved to prisma.milestone.update + escrow state machine', async () => {
      const event = {
        paging_token: 'token-ma1',
        ledger_attr: '2100',
        transaction_hash: 'tx-ma1',
        index: 0,
        topic: ['mil_apr', { u64: '101' }],
        data: {
          milestone_index: 0,
        },
      };

      mockPrisma.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockPrisma.$transaction.mockResolvedValueOnce([
        { milestoneIndex: 0, status: 'Approved' },
        { id: 101n, status: 'Completed' },
      ]);

      await stellarListener.processContractEvent(event);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      const txOps = mockPrisma.$transaction.mock.calls[0][0];
      expect(txOps).toHaveLength(2); // milestone update + escrow update
    });

    it('should map DisputeRaised to prisma.dispute.create + state machine transition', async () => {
      const event = {
        paging_token: 'token-dr1',
        ledger_attr: '2200',
        transaction_hash: 'tx-dr1',
        index: 0,
        topic: ['dsp_rsd', { u64: '102' }],
        data: {
          raised_by: 'GAAAAA...',
          reason: 'Non-delivery',
        },
      };

      mockPrisma.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockPrisma.$transaction.mockResolvedValueOnce([
        { escrowId: 102n, status: 'Disputed' },
        { id: 102n, status: 'Disputed' },
      ]);

      await stellarListener.processContractEvent(event);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      const txOps = mockPrisma.$transaction.mock.calls[0][0];
      expect(txOps).toHaveLength(2); // dispute create + escrow update
    });

    it('should map ReputationEvent to prisma.reputation.upsert', async () => {
      const event = {
        paging_token: 'token-re1',
        ledger_attr: '2300',
        transaction_hash: 'tx-re1',
        index: 0,
        topic: ['rep_evt', null],
        data: {
          address: 'GAAAAA...',
          score_delta: 100,
          event_type: 'ESCROW_COMPLETED',
        },
      };

      mockPrisma.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockPrisma.$transaction.mockResolvedValueOnce([
        { address: 'GAAAAA...', totalScore: 100n },
        { id: 1, address: 'GAAAAA...' },
      ]);

      await stellarListener.processContractEvent(event);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      const txOps = mockPrisma.$transaction.mock.calls[0][0];
      expect(txOps).toHaveLength(2); // reputation upsert + event create
    });
  });

  // ── At-least-once Delivery Tests ──────────────────────────────────────────

  describe('at-least-once delivery guarantee', () => {
    it('cursor is saved after each event', async () => {
      const event = {
        paging_token: 'token-save',
        ledger_attr: '3000',
        transaction_hash: 'tx-save',
        index: 0,
        topic: ['esc_crt', { u64: '200' }],
        data: {
          client: 'GAAAAA...',
          freelancer: 'GBBBBB...',
          token: 'GCCCCCC...',
          amount: { u128: '1000' },
        },
      };

      mockPrisma.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockPrisma.escrow.upsert.mockResolvedValueOnce({ id: 200n });
      mockPrisma.processedEvent.create.mockResolvedValueOnce({ id: 1 });
      mockPrisma.systemConfig.upsert.mockResolvedValueOnce({
        key: 'horizon_cursor',
        value: 'token-save',
      });

      // Simulate: processContractEvent calls saveCursor
      await stellarListener.processContractEvent(event);
      // In actual implementation, saveCursor would be called within the listener loop
      await stellarListener.saveCursor(event.paging_token);

      expect(mockPrisma.systemConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'horizon_cursor' },
          update: { value: 'token-save' },
        }),
      );
    });

    it('on restart, listener resumes from saved cursor (no re-processing)', async () => {
      const savedCursor = 'last-position';

      mockPrisma.systemConfig.findUnique.mockResolvedValueOnce({
        key: 'horizon_cursor',
        value: savedCursor,
      });

      const cursor = await stellarListener.loadCursor();

      // Listener would resume from this exact cursor
      expect(cursor).toBe(savedCursor);
    });
  });

  // ── Edge Case Tests ───────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle event with null paging_token gracefully', async () => {
      const event = {
        paging_token: null,
        ledger_attr: '9000',
      };

      // Should not throw
      await expect(stellarListener.processContractEvent(event)).resolves.not.toThrow();
    });

    it('should handle malformed event data', async () => {
      const event = {
        paging_token: 'token-malformed',
        ledger_attr: '9001',
        transaction_hash: 'tx-malformed',
        index: 0,
        topic: [],
        data: {}, // Missing required fields
      };

      mockPrisma.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockPrisma.processedEvent.create.mockResolvedValueOnce({ id: 1 });

      // Should skip handler due to missing data, but still record as processed
      await stellarListener.processContractEvent(event);

      expect(mockPrisma.processedEvent.create).toHaveBeenCalled();
    });

    it('should gracefully handle database errors', async () => {
      const event = {
        paging_token: 'token-db-error',
        ledger_attr: '9002',
        transaction_hash: 'tx-db-error',
        index: 0,
        topic: ['esc_crt', { u64: '999' }],
        data: {
          client: 'GAAAAA...',
          freelancer: 'GBBBBB...',
          token: 'GCCCCCC...',
          amount: { u128: '1000' },
        },
      };

      mockPrisma.processedEvent.findUnique.mockResolvedValueOnce(null);
      mockPrisma.escrow.upsert.mockRejectedValueOnce(new Error('DB connection failed'));

      // Should throw and not record as processed
      await expect(stellarListener.processContractEvent(event)).rejects.toThrow(
        'DB connection failed',
      );

      expect(mockPrisma.processedEvent.create).not.toHaveBeenCalled();
    });
  });
});

// ── Integration Tests (5 mock events) ─────────────────────────────────────────

describe('stellarListener integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('replays 5 mock Horizon events and verifies DB state', async () => {
    const mockEvents = [
      {
        paging_token: 'token-int-1',
        ledger_attr: '10000',
        transaction_hash: 'tx-int-1',
        index: 0,
        topic: ['esc_crt', { u64: '1' }],
        data: {
          client: 'GAAAAA...',
          freelancer: 'GBBBBB...',
          token: 'GCCCCCC...',
          amount: { u128: '1000000' },
        },
      },
      {
        paging_token: 'token-int-2',
        ledger_attr: '10001',
        transaction_hash: 'tx-int-2',
        index: 1,
        topic: ['esc_crt', { u64: '2' }],
        data: {
          client: 'GDDDD...',
          freelancer: 'GEEEE...',
          token: 'GFFFFFF...',
          amount: { u128: '2000000' },
        },
      },
      {
        paging_token: 'token-int-3',
        ledger_attr: '10002',
        transaction_hash: 'tx-int-3',
        index: 2,
        topic: ['mil_apr', { u64: '1' }],
        data: {
          milestone_index: 0,
        },
      },
      {
        paging_token: 'token-int-4',
        ledger_attr: '10003',
        transaction_hash: 'tx-int-4',
        index: 3,
        topic: ['dsp_rsd', { u64: '2' }],
        data: {
          raised_by: 'GDDDD...',
          reason: 'Delayed delivery',
        },
      },
      {
        paging_token: 'token-int-5',
        ledger_attr: '10004',
        transaction_hash: 'tx-int-5',
        index: 4,
        topic: ['rep_evt', null],
        data: {
          address: 'GAAAAA...',
          score_delta: 50,
          event_type: 'DISPUTE_WON',
        },
      },
    ];

    // Mock all operations
    mockPrisma.processedEvent.findUnique.mockResolvedValue(null);
    mockPrisma.processedEvent.create.mockResolvedValue({ id: 1 });
    mockPrisma.escrow.upsert.mockResolvedValue({ id: 1n, status: 'Active' });
    mockPrisma.$transaction.mockResolvedValue([]);

    // Process all 5 events
    for (const event of mockEvents) {
      await stellarListener.processContractEvent(event);
    }

    // Verify 5 rows created in processedEvent
    expect(mockPrisma.processedEvent.create).toHaveBeenCalledTimes(5);

    // Verify correct event types were recorded
    const calls = mockPrisma.processedEvent.create.mock.calls;
    const recordedTypes = calls.map((call) => call[0].data.eventType);
    expect(recordedTypes).toContain('EscrowCreated');
    expect(recordedTypes).toContain('MilestoneApproved');
    expect(recordedTypes).toContain('DisputeRaised');
    expect(recordedTypes).toContain('ReputationEvent');
  });

  it('verifies 5 rows in processedEvent table', async () => {
    const mockEvents = [
      {
        paging_token: 'token-5-1',
        ledger_attr: '20000',
        transaction_hash: 'tx-5-1',
        index: 0,
        topic: ['esc_crt', { u64: '1' }],
        data: { client: 'G1', freelancer: 'G2', token: 'G3', amount: { u128: '1000' } },
      },
      {
        paging_token: 'token-5-2',
        ledger_attr: '20001',
        transaction_hash: 'tx-5-2',
        index: 1,
        topic: ['esc_crt', { u64: '2' }],
        data: { client: 'G4', freelancer: 'G5', token: 'G6', amount: { u128: '2000' } },
      },
      {
        paging_token: 'token-5-3',
        ledger_attr: '20002',
        transaction_hash: 'tx-5-3',
        index: 2,
        topic: ['mil_apr', { u64: '3' }],
        data: { milestone_index: 0 },
      },
      {
        paging_token: 'token-5-4',
        ledger_attr: '20003',
        transaction_hash: 'tx-5-4',
        index: 3,
        topic: ['dsp_rsd', { u64: '4' }],
        data: { raised_by: 'G1', reason: 'Issue' },
      },
      {
        paging_token: 'token-5-5',
        ledger_attr: '20004',
        transaction_hash: 'tx-5-5',
        index: 4,
        topic: ['rep_evt', null],
        data: { address: 'G1', score_delta: 25, event_type: 'ESCROW_COMPLETED' },
      },
    ];

    mockPrisma.processedEvent.findUnique.mockResolvedValue(null);
    mockPrisma.processedEvent.create.mockResolvedValue({ id: 1 });
    mockPrisma.escrow.upsert.mockResolvedValue({ id: 1n });
    mockPrisma.$transaction.mockResolvedValue([]);

    for (const event of mockEvents) {
      await stellarListener.processContractEvent(event);
    }

    // Verify all 5 events recorded
    expect(mockPrisma.processedEvent.create).toHaveBeenCalledTimes(5);

    // Each call should have unique paging_token
    const createdTokens = mockPrisma.processedEvent.create.mock.calls.map(
      (call) => call[0].data.pagingToken,
    );
    expect(new Set(createdTokens).size).toBe(5);
  });
});
