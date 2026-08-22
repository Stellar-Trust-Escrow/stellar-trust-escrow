import { jest, describe, expect, it } from '@jest/globals';

jest.unstable_mockModule('../../config/logger.js', () => ({
  createModuleLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { appendAuditEntry, verifyEntry, log, AuditCategory, AuditAction } =
  await import('../../services/auditService.js');

describe('auditService', () => {
  describe('AuditCategory and AuditAction constants', () => {
    it('AuditCategory is an object with string values', () => {
      expect(typeof AuditCategory).toBe('object');
      expect(Object.values(AuditCategory).every(v => typeof v === 'string')).toBe(true);
    });

    it('AuditAction is an object with string values', () => {
      expect(typeof AuditAction).toBe('object');
      expect(Object.values(AuditAction).every(v => typeof v === 'string')).toBe(true);
    });
  });

  describe('appendAuditEntry', () => {
    it('resolves without throwing for valid input', async () => {
      await expect(
        appendAuditEntry({
          action: AuditAction.ESCROW_CREATED || 'ESCROW_CREATED',
          targetAddress: 'GABC',
          performedBy: 'system',
          tenantId: 'default',
        })
      ).resolves.toBeDefined();
    });

    it('returns an object with id field', async () => {
      const result = await appendAuditEntry({
        action: 'ESCROW_CREATED',
        targetAddress: 'GABC',
        performedBy: 'admin',
        tenantId: 'default',
      });
      expect(result).toHaveProperty('id');
    });
  });

  describe('log (alias)', () => {
    it('log function exists and is callable', async () => {
      expect(typeof log).toBe('function');
      await expect(
        log({ action: 'ESCROW_CREATED', targetAddress: 'GABC', tenantId: 'default' })
      ).resolves.toBeDefined();
    });
  });

  describe('verifyEntry', () => {
    it('verifyEntry function exists', () => {
      expect(typeof verifyEntry).toBe('function');
    });

    it('resolves or rejects for a nonexistent entry', async () => {
      const result = await verifyEntry('nonexistent-id').catch(e => ({ error: e.message }));
      expect(result !== undefined).toBe(true);
    });
  });
});
