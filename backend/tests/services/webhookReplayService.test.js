import { jest } from '@jest/globals';

const prismaMock = {
  webhookDelivery: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  webhookReplayAudit: {
    create: jest.fn(),
  },
};

const axiosMock = {
  post: jest.fn(),
};

jest.unstable_mockModule('../../lib/prisma.js', () => ({ default: prismaMock }));
jest.unstable_mockModule('axios', () => ({ default: axiosMock }));

const webhookReplayService = await import('../../services/webhookReplayService.js');

describe('webhookReplayService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('replayFailedDeliveries', () => {
    it('returns correct summary when no failed deliveries exist', async () => {
      prismaMock.webhookDelivery.findMany.mockResolvedValue([]);

      const result = await webhookReplayService.replayFailedDeliveries(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result).toEqual({ replayed: 0, skipped: 0, failed: 0 });
    });

    it('validates date parameters are valid dates', async () => {
      await expect(
        webhookReplayService.replayFailedDeliveries('invalid-date', '2026-01-31'),
      ).rejects.toThrow('fromDate and toDate must be valid dates');

      await expect(
        webhookReplayService.replayFailedDeliveries('2026-01-01', 'invalid-date'),
      ).rejects.toThrow('fromDate and toDate must be valid dates');
    });

    it('rejects when fromDate is after toDate', async () => {
      await expect(
        webhookReplayService.replayFailedDeliveries(
          new Date('2026-01-31'),
          new Date('2026-01-01'),
        ),
      ).rejects.toThrow('fromDate must be before or equal to toDate');
    });

    it('accepts string dates and converts them to Date objects', async () => {
      prismaMock.webhookDelivery.findMany.mockResolvedValue([]);

      const result = await webhookReplayService.replayFailedDeliveries(
        '2026-01-01T00:00:00Z',
        '2026-01-31T23:59:59Z',
      );

      expect(result).toEqual({ replayed: 0, skipped: 0, failed: 0 });
    });

    it('queries failed deliveries within the specified date range', async () => {
      const from = new Date('2026-01-01');
      const to = new Date('2026-01-31');
      prismaMock.webhookDelivery.findMany.mockResolvedValue([]);

      await webhookReplayService.replayFailedDeliveries(from, to);

      expect(prismaMock.webhookDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'failed',
            attemptedAt: { gte: from, lte: to },
          }),
          orderBy: { id: 'asc' },
          take: 50,
        }),
      );
    });

    it('uses custom batchSize when provided', async () => {
      prismaMock.webhookDelivery.findMany.mockResolvedValue([]);

      await webhookReplayService.replayFailedDeliveries(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        { batchSize: 100 },
      );

      expect(prismaMock.webhookDelivery.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });

    it('retries failed deliveries up to maxAttempts with exponential backoff', async () => {
      const delivery = {
        id: 'del_1',
        endpointUrl: 'https://example.com/webhook',
        payload: { eventType: 'test' },
        signature: 'sig_123',
      };

      prismaMock.webhookDelivery.findMany
        .mockResolvedValueOnce([delivery])
        .mockResolvedValueOnce([]);
      axiosMock.post.mockRejectedValueOnce(new Error('Timeout'));
      axiosMock.post.mockResolvedValueOnce({ status: 200 });

      const result = await webhookReplayService.replayFailedDeliveries(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        { maxAttempts: 3 },
      );

      expect(result).toEqual({ replayed: 1, skipped: 0, failed: 0 });
      expect(axiosMock.post).toHaveBeenCalledTimes(2);
    });

    it('marks delivery as replayed on successful retry', async () => {
      const delivery = {
        id: 'del_1',
        endpointUrl: 'https://example.com/webhook',
        payload: { eventType: 'test' },
        signature: 'sig_123',
      };

      prismaMock.webhookDelivery.findMany
        .mockResolvedValueOnce([delivery])
        .mockResolvedValueOnce([]);
      axiosMock.post.mockResolvedValueOnce({ status: 200 });

      const result = await webhookReplayService.replayFailedDeliveries(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.replayed).toBe(1);
      expect(prismaMock.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 'del_1' },
        data: expect.objectContaining({
          status: 'replayed',
          lastReplayedAt: expect.any(Date),
        }),
      });
    });

    it('marks delivery as replay_failed after all retries exhausted', async () => {
      const delivery = {
        id: 'del_1',
        endpointUrl: 'https://example.com/webhook',
        payload: { eventType: 'test' },
        signature: 'sig_123',
      };

      prismaMock.webhookDelivery.findMany
        .mockResolvedValueOnce([delivery])
        .mockResolvedValueOnce([]);
      axiosMock.post.mockRejectedValue(new Error('Permanent failure'));

      const result = await webhookReplayService.replayFailedDeliveries(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        { maxAttempts: 2 },
      );

      expect(result.failed).toBe(1);
      expect(prismaMock.webhookDelivery.update).toHaveBeenCalledWith({
        where: { id: 'del_1' },
        data: expect.objectContaining({
          status: 'replay_failed',
          lastReplayedAt: expect.any(Date),
        }),
      });
    });

    it('handles pagination with cursor-based iteration', async () => {
      const deliveries = Array.from({ length: 50 }, (_, i) => ({
        id: `del_${i}`,
        endpointUrl: 'https://example.com/webhook',
        payload: { eventType: 'test' },
        signature: 'sig',
      }));

      const secondBatch = Array.from({ length: 30 }, (_, i) => ({
        id: `del_${50 + i}`,
        endpointUrl: 'https://example.com/webhook',
        payload: { eventType: 'test' },
        signature: 'sig',
      }));

      prismaMock.webhookDelivery.findMany
        .mockResolvedValueOnce(deliveries)
        .mockResolvedValueOnce(secondBatch)
        .mockResolvedValueOnce([]);
      axiosMock.post.mockResolvedValue({ status: 200 });

      const result = await webhookReplayService.replayFailedDeliveries(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        { batchSize: 50 },
      );

      expect(result).toEqual({ replayed: 80, skipped: 0, failed: 0 });
      expect(prismaMock.webhookDelivery.findMany).toHaveBeenCalledTimes(3);
    });

    it('logs replay attempts to audit trail', async () => {
      const delivery = {
        id: 'del_1',
        endpointUrl: 'https://example.com/webhook',
        payload: { eventType: 'test' },
        signature: 'sig_123',
      };

      prismaMock.webhookDelivery.findMany
        .mockResolvedValueOnce([delivery])
        .mockResolvedValueOnce([]);
      axiosMock.post.mockResolvedValueOnce({ status: 200 });

      await webhookReplayService.replayFailedDeliveries(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(prismaMock.webhookReplayAudit.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deliveryId: 'del_1',
            status: 'success',
            replayedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('logReplay', () => {
    it('throws TypeError when deliveryId is not a string', async () => {
      await expect(webhookReplayService.logReplay(123, 'success')).rejects.toThrow(
        'deliveryId must be a non-empty string',
      );
    });

    it('throws TypeError when status is invalid', async () => {
      await expect(webhookReplayService.logReplay('del_1', 'invalid')).rejects.toThrow(
        'status must be one of success, failure, skipped',
      );
    });

    it('creates audit record with valid inputs', async () => {
      prismaMock.webhookReplayAudit.create.mockResolvedValue({
        id: 'audit_1',
      });

      await webhookReplayService.logReplay('del_1', 'success');

      expect(prismaMock.webhookReplayAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deliveryId: 'del_1',
          status: 'success',
          replayedAt: expect.any(Date),
        }),
      });
    });
  });
});
