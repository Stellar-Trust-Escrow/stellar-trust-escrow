import analyticsController from '../../api/controllers/analyticsController.js';
import prisma from '../../lib/prisma.js';
import cache from '../../lib/cache.js';
import { jest } from '@jest/globals';

jest.mock('../../lib/prisma.js', () => ({
  $queryRaw: jest.fn(),
  sql: jest.fn((strings, ...values) => ({ strings, values })),
  empty: { strings: [''], values: [] },
  join: jest.fn((arr) => arr)
}));

jest.mock('../../lib/cache.js', () => ({
  get: jest.fn(),
  set: jest.fn()
}));

const mockReq = (query = {}, tenant = null) => ({
  query,
  tenant,
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Analytics Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getVolume', () => {
    it('returns 400 if from or to are missing', async () => {
      const req = mockReq({ from: '2023-01-01' });
      const res = mockRes();
      await analyticsController.getVolume(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'from and to query parameters are required' });
    });

    it('returns cached data if available', async () => {
      cache.get.mockResolvedValue({ labels: [], funded: [] });
      const req = mockReq({ from: '2023-01-01', to: '2023-12-31' });
      const res = mockRes();
      await analyticsController.getVolume(req, res);
      expect(res.json).toHaveBeenCalledWith({ labels: [], funded: [] });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('queries and returns volume data', async () => {
      cache.get.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([
        { date_label: '2023-01-01T00:00:00.000Z', funded: 10n, completed: 5n, disputed: 2n }
      ]);
      const req = mockReq({ from: '2023-01-01', to: '2023-01-31' });
      const res = mockRes();
      
      await analyticsController.getVolume(req, res);
      expect(res.json).toHaveBeenCalledWith({
        labels: ['2023-01-01T00:00:00.000Z'],
        funded: [10],
        completed: [5],
        disputed: [2]
      });
      expect(cache.set).toHaveBeenCalled();
    });
  });

  describe('getDisputeRate', () => {
    it('returns calculated dispute rate', async () => {
      cache.get.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([
        { date_label: '2023-01-01T00:00:00.000Z', funded: 10n, disputed: 2n }
      ]);
      const req = mockReq({ from: '2023-01-01', to: '2023-01-31' });
      const res = mockRes();
      
      await analyticsController.getDisputeRate(req, res);
      expect(res.json).toHaveBeenCalledWith({
        labels: ['2023-01-01T00:00:00.000Z'],
        dispute_rate: [20]
      });
    });
  });

  describe('getResolutionTime', () => {
    it('returns stats and histogram', async () => {
      cache.get.mockResolvedValue(null);
      prisma.$queryRaw
        .mockResolvedValueOnce([{ p50: 24, p90: 48, p99: 72 }]) // stats
        .mockResolvedValueOnce([{ bucket_hours: 24n, count: 5n }]); // histogram
        
      const req = mockReq({ from: '2023-01-01', to: '2023-01-31' });
      const res = mockRes();
      
      await analyticsController.getResolutionTime(req, res);
      expect(res.json).toHaveBeenCalledWith({
        p50_hours: 24,
        p90_hours: 48,
        p99_hours: 72,
        histogram: [{ bucket_hours: 24, count: 5 }]
      });
    });
  });

  describe('getCohortRetention', () => {
    it('returns 400 if cohort_month missing', async () => {
      const req = mockReq({});
      const res = mockRes();
      await analyticsController.getCohortRetention(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 0s if cohort is empty', async () => {
      cache.get.mockResolvedValue(null);
      prisma.$queryRaw.mockResolvedValue([]); // No users in cohort
      
      const req = mockReq({ cohort_month: '2023-01' });
      const res = mockRes();
      
      await analyticsController.getCohortRetention(req, res);
      expect(res.json).toHaveBeenCalledWith({
        weeks: [1, 2, 3, 4, 5, 6, 7, 8],
        retention: [0, 0, 0, 0, 0, 0, 0, 0]
      });
    });

    it('calculates retention correctly', async () => {
      cache.get.mockResolvedValue(null);
      // Mock cohort users
      prisma.$queryRaw.mockResolvedValueOnce([
        { client_address: 'A' },
        { client_address: 'B' }
      ]);
      // Mock activity
      const activityDate = new Date(Date.UTC(2023, 1, 10)); // Week 2
      prisma.$queryRaw.mockResolvedValueOnce([
        { client_address: 'A', created_at: activityDate }
      ]);
      
      const req = mockReq({ cohort_month: '2023-01' });
      const res = mockRes();
      
      await analyticsController.getCohortRetention(req, res);
      expect(res.json).toHaveBeenCalledWith({
        weeks: [1, 2, 3, 4, 5, 6, 7, 8],
        retention: [0, 50, 0, 0, 0, 0, 0, 0]
      });
    });
  });
});
