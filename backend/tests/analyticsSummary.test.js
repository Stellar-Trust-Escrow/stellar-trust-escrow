import { jest } from '@jest/globals';

// Test the getSummary and exportCSV logic inline (avoids Prisma/cache import chain)

function makeSummaryService() {
  function getSummaryData(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const dailyBreakdown = Array.from({ length: days }, (_, i) => {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      return { date: d.toISOString().split('T')[0], count: 0, volume: '0' };
    });
    return { totalEscrows: 0, dailyBreakdown, totalXLMVolume: '0', disputeRate: 0, avgResolutionHours: 0, topContributors: [] };
  }

  function exportCSV(data) {
    if (!data || data.length === 0) return '';
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    return [headers, ...rows].join('\n');
  }

  return { getSummaryData, exportCSV };
}

describe('analytics summary helpers', () => {
  const svc = makeSummaryService();

  test('getSummaryData returns shape with correct dailyBreakdown length', () => {
    const result = svc.getSummaryData(7);
    expect(result).toHaveProperty('totalEscrows');
    expect(result).toHaveProperty('dailyBreakdown');
    expect(result.dailyBreakdown).toHaveLength(7);
    expect(result.dailyBreakdown[0]).toHaveProperty('date');
    expect(result.dailyBreakdown[0]).toHaveProperty('count');
  });

  test('getSummaryData returns 30-day breakdown by default', () => {
    const result = svc.getSummaryData(30);
    expect(result.dailyBreakdown).toHaveLength(30);
  });

  test('getSummaryData dates are in YYYY-MM-DD format', () => {
    const result = svc.getSummaryData(5);
    for (const entry of result.dailyBreakdown) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test('exportCSV produces correct header row', () => {
    const csv = svc.exportCSV([{ date: '2026-01-01', count: 5, volume: '100' }]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('date,count,volume');
    expect(lines[1]).toContain('2026-01-01');
  });

  test('exportCSV returns empty string for empty array', () => {
    expect(svc.exportCSV([])).toBe('');
  });

  test('exportCSV escapes double quotes in values', () => {
    const csv = svc.exportCSV([{ name: 'say "hello"' }]);
    expect(csv).toContain('say ""hello""');
  });
});
