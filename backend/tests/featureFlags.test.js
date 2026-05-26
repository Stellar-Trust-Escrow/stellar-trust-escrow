import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock prisma ───────────────────────────────────────────────────────────────
const flagStore = new Map();

const prismaMock = {
  featureFlag: {
    findUnique: jest.fn(({ where }) => Promise.resolve(flagStore.get(where.key) ?? null)),
    findMany: jest.fn(() => Promise.resolve([...flagStore.values()])),
    create: jest.fn(({ data }) => {
      flagStore.set(data.key, { ...data });
      return Promise.resolve(flagStore.get(data.key));
    }),
    update: jest.fn(({ where, data }) => {
      const existing = flagStore.get(where.key);
      if (!existing) { const e = new Error('Not found'); e.code = 'P2025'; throw e; }
      const updated = { ...existing, ...data };
      flagStore.set(where.key, updated);
      return Promise.resolve(updated);
    }),
    delete: jest.fn(({ where }) => {
      flagStore.delete(where.key);
      return Promise.resolve();
    }),
  },
  auditLog: {
    create: jest.fn(() => Promise.resolve()),
  },
};

jest.unstable_mockModule('../lib/prisma.js', () => ({ default: prismaMock }));

const { isFeatureEnabled, createFlag, updateFlag } = await import('../services/featureFlags.js');

describe('Feature Flags Service', () => {
  beforeEach(() => {
    flagStore.clear();
    jest.clearAllMocks();
  });

  describe('Test 1 (Deterministic Rollout)', () => {
    it('consistently evaluates the same user the same way at 20% rollout', async () => {
      // Find a user that IS in the 20% bucket and one that is NOT
      // by brute-forcing with the same hash logic
      const crypto = await import('crypto');
      function bucket(userId, key) {
        const hash = crypto.createHash('sha256').update(`${userId}:${key}`).digest('hex');
        return parseInt(hash.slice(0, 8), 16) % 100;
      }

      const flagKey = 'new-dashboard';
      let userIn = null;
      let userOut = null;

      for (let i = 0; i < 1000; i++) {
        const id = String(i);
        const b = bucket(id, flagKey);
        if (b < 20 && !userIn) userIn = id;
        if (b >= 20 && !userOut) userOut = id;
        if (userIn && userOut) break;
      }

      await createFlag({ key: flagKey, isEnabled: true, percentage: 20, targetUsers: [] }, 'admin');

      // userIn should consistently see the feature
      const result1a = await isFeatureEnabled(flagKey, { id: userIn });
      const result1b = await isFeatureEnabled(flagKey, { id: userIn });
      expect(result1a).toBe(true);
      expect(result1b).toBe(true);

      // userOut should consistently NOT see the feature
      const result2a = await isFeatureEnabled(flagKey, { id: userOut });
      const result2b = await isFeatureEnabled(flagKey, { id: userOut });
      expect(result2a).toBe(false);
      expect(result2b).toBe(false);
    });
  });

  describe('Test 2 (Targeting)', () => {
    it('returns true for a user in targetUsers even when isEnabled is false', async () => {
      await createFlag(
        { key: 'beta-payments', isEnabled: false, percentage: 0, targetUsers: ['user-42'] },
        'admin',
      );

      const enabled = await isFeatureEnabled('beta-payments', { id: 'user-42' });
      expect(enabled).toBe(true);

      const notEnabled = await isFeatureEnabled('beta-payments', { id: 'user-99' });
      expect(notEnabled).toBe(false);
    });
  });

  describe('Test 3 (Audit)', () => {
    it('creates an audit log entry when a flag is toggled', async () => {
      await createFlag({ key: 'audit-test', isEnabled: false, percentage: 0 }, 'admin-1');
      await updateFlag('audit-test', { isEnabled: true }, 'admin-1');

      // auditLog.create should have been called for both create and update
      expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(2);

      const calls = prismaMock.auditLog.create.mock.calls;
      expect(calls[0][0].data).toMatchObject({ action: 'FLAG_CREATED', resourceId: 'audit-test' });
      expect(calls[1][0].data).toMatchObject({ action: 'FLAG_UPDATED', resourceId: 'audit-test' });
    });
  });

  describe('edge cases', () => {
    it('returns false for a non-existent flag', async () => {
      const result = await isFeatureEnabled('does-not-exist', { id: '1' });
      expect(result).toBe(false);
    });

    it('returns false for a disabled flag with no targeting', async () => {
      await createFlag({ key: 'off-flag', isEnabled: false, percentage: 100 }, 'admin');
      const result = await isFeatureEnabled('off-flag', { id: 'any-user' });
      expect(result).toBe(false);
    });
  });
});
